import { access, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname)
const packageJsonPath = path.join(projectRoot, 'package.json')

function parsePlatform() {
  const args = process.argv.slice(2)
  const platformIndex = args.indexOf('--platform')
  const inlinePlatform = args.find((arg) => arg.startsWith('--platform='))?.split('=')[1]
  const requested = inlinePlatform || (platformIndex >= 0 ? args[platformIndex + 1] : 'current')

  if (!['current', 'mac', 'win'].includes(requested)) {
    throw new Error('平台参数只能是 current、mac 或 win，例如：npm run release:package -- --platform mac')
  }
  return requested === 'current' ? (process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : null) : requested
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: false,
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} 执行失败（code=${code ?? 'null'}, signal=${signal ?? 'none'}）`))
    })
  })
}

async function assertExists(filePath, label) {
  try {
    await access(filePath)
  } catch {
    throw new Error(`${label}没有生成：${filePath}`)
  }
}

async function main() {
  const platform = parsePlatform()
  if (!platform) throw new Error('只支持在 Apple Silicon Mac 或 Windows 上打包。')
  if (platform === 'mac' && process.platform !== 'darwin') throw new Error('macOS 安装包必须在 macOS 上生成。')
  if (platform === 'mac' && process.arch !== 'arm64') throw new Error('macOS 安装包要求在 Apple Silicon（arm64）Mac 上生成。')
  if (platform === 'win' && process.platform !== 'win32') throw new Error('Windows 安装包必须在 Windows 上生成。')

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  const version = packageJson.version
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const commandArgs = platform === 'mac' ? ['run', 'dist:mac', '--', '--arm64'] : ['run', 'dist:win']

  console.log(`开始生成 ${platform === 'mac' ? 'macOS arm64 DMG' : 'Windows x64 EXE'}，版本 v${version}`)
  await run(npmCommand, commandArgs)

  const artifactName = platform === 'mac'
    ? `AI-Bedtime-Story-Studio-${version}-arm64.dmg`
    : `AI-Bedtime-Story-Studio-${version}-x64-setup.exe`
  const artifactPath = path.join(projectRoot, 'release', artifactName)
  await assertExists(artifactPath, '安装包')
  console.log(`打包完成：${artifactPath}`)
  console.log('如果要发布到 R2，请准备好另一个平台的安装包后执行 npm run release:upload。')
}

main().catch((error) => {
  console.error(`打包失败：${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
