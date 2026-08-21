import { createHmac, createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname)
const releaseDirectory = path.resolve(projectRoot, process.env.RELEASE_DIR || 'release')
const downloadsConfigPath = path.join(projectRoot, 'website', 'public', 'downloads.json')
const localEnvironmentPath = path.join(projectRoot, '.env.release.local')

const requiredEnvironment = [
  'CLOUDFLARE_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
]

async function loadLocalEnvironment() {
  let contents
  try {
    contents = await readFile(localEnvironmentPath, 'utf8')
  } catch {
    return
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match || process.env[match[1]]) continue
    const rawValue = match[2]
    process.env[match[1]] = rawValue.replace(/^(['"])(.*)\1$/, '$2')
  }
}

function requireEnvironment() {
  const missing = requiredEnvironment.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(`缺少环境变量：${missing.join(', ')}。请检查项目根目录的 .env.release.local。`)
  }
}

function publicUrl(key) {
  const base = process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '')
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`
}

async function sha256(filePath) {
  const contents = await readFile(filePath)
  return createHash('sha256').update(contents).digest('hex')
}

async function findArtifact(fileName, label) {
  const artifactPath = path.join(releaseDirectory, fileName)
  try {
    await stat(artifactPath)
  } catch {
    throw new Error(`release/ 中没有找到当前版本的 ${label} 安装包：${fileName}。请先完成打包。`)
  }
  return artifactPath
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

function hmac(key, value, encoding) {
  const digest = createHmac('sha256', key).update(value).digest()
  return encoding ? digest.toString(encoding) : digest
}

function r2Endpoint() {
  return new URL(
    process.env.R2_S3_ENDPOINT || `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  )
}

async function uploadFile(filePath, key) {
  const contents = await readFile(filePath)
  const payloadHash = createHash('sha256').update(contents).digest('hex')
  const endpoint = r2Endpoint()
  const canonicalPath = `/${awsEncode(process.env.R2_BUCKET)}/${key.split('/').map(awsEncode).join('/')}`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const shortDate = amzDate.slice(0, 8)
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = [
    `host:${endpoint.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n')
  const canonicalRequest = [
    'PUT',
    canonicalPath,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const credentialScope = `${shortDate}/auto/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n')
  const dateKey = hmac(`AWS4${process.env.R2_SECRET_ACCESS_KEY}`, shortDate)
  const regionKey = hmac(dateKey, 'auto')
  const serviceKey = hmac(regionKey, 's3')
  const signingKey = hmac(serviceKey, 'aws4_request')
  const signature = hmac(signingKey, stringToSign, 'hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${process.env.R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const response = await fetch(`${endpoint.origin}${canonicalPath}`, {
    method: 'PUT',
    headers: {
      authorization,
      'content-type': 'application/octet-stream',
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body: contents,
  })
  const responseText = await response.text()
  if (!response.ok) {
    throw new Error(`R2 上传失败（${response.status}）：${responseText.slice(0, 500)}`)
  }
}

async function main() {
  await loadLocalEnvironment()
  requireEnvironment()

  const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
  const version = packageJson.version
  const windowsPath = await findArtifact(`AI-Bedtime-Story-Studio-${version}-x64-setup.exe`, 'Windows x64')
  const macosPath = await findArtifact(`AI-Bedtime-Story-Studio-${version}-arm64.dmg`, 'macOS arm64')
  const versionDirectory = `releases/v${version}`
  const artifacts = [
    { platform: 'windows', filePath: windowsPath },
    { platform: 'macos', filePath: macosPath },
  ]

  console.log(`准备发布 v${version}`)
  for (const artifact of artifacts) {
    const fileName = path.basename(artifact.filePath)
    const versionKey = `${versionDirectory}/${fileName}`
    const fileInfo = await stat(artifact.filePath)
    const checksum = await sha256(artifact.filePath)

    console.log(`上传 ${fileName} (${(fileInfo.size / 1024 / 1024).toFixed(1)} MB)`)
    await uploadFile(artifact.filePath, versionKey)
    artifact.fileName = fileName
    artifact.versionUrl = publicUrl(versionKey)
    artifact.size = fileInfo.size
    artifact.sha256 = checksum
  }

  const publicMetadata = (artifact) => ({
    fileName: artifact.fileName,
    versionUrl: artifact.versionUrl,
    size: artifact.size,
    sha256: artifact.sha256,
  })

  await mkdir(path.dirname(downloadsConfigPath), { recursive: true })
  await writeFile(
    downloadsConfigPath,
    `${JSON.stringify({
      version,
      updatedAt: new Date().toISOString(),
      windows: publicMetadata(artifacts[0]),
      macos: publicMetadata(artifacts[1]),
    }, null, 2)}\n`,
    'utf8',
  )

  console.log('官网下载配置已更新：website/public/downloads.json')
  console.log(`Windows: ${artifacts[0].versionUrl}`)
  console.log(`macOS:   ${artifacts[1].versionUrl}`)
  console.log('接下来请检查 downloads.json，然后 git add、commit、push。')
}

main().catch((error) => {
  console.error(`发布失败：${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
