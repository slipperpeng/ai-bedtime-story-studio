export function createDemoAudioWav(seedText: string): Buffer {
  const sampleRate = 16_000
  const durationSeconds = Math.min(4, Math.max(1.8, seedText.length / 80))
  const sampleCount = Math.floor(sampleRate * durationSeconds)
  const dataSize = sampleCount * 2
  const output = Buffer.alloc(44 + dataSize)
  output.write('RIFF', 0)
  output.writeUInt32LE(36 + dataSize, 4)
  output.write('WAVE', 8)
  output.write('fmt ', 12)
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20)
  output.writeUInt16LE(1, 22)
  output.writeUInt32LE(sampleRate, 24)
  output.writeUInt32LE(sampleRate * 2, 28)
  output.writeUInt16LE(2, 32)
  output.writeUInt16LE(16, 34)
  output.write('data', 36)
  output.writeUInt32LE(dataSize, 40)
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate
    const envelope = Math.min(1, time * 4) * Math.min(1, (durationSeconds - time) * 3)
    const value = Math.sin(2 * Math.PI * 392 * time) * 0.025
      + Math.sin(2 * Math.PI * 523.25 * time) * 0.012
    output.writeInt16LE(Math.round(value * envelope * 32767), 44 + index * 2)
  }
  return output
}

export function createDemoBackgroundMusicWav(seedText: string): Buffer {
  const sampleRate = 22_050
  const durationSeconds = 12
  const sampleCount = sampleRate * durationSeconds
  const dataSize = sampleCount * 2
  const output = Buffer.alloc(44 + dataSize)
  output.write('RIFF', 0)
  output.writeUInt32LE(36 + dataSize, 4)
  output.write('WAVE', 8)
  output.write('fmt ', 12)
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20)
  output.writeUInt16LE(1, 22)
  output.writeUInt32LE(sampleRate, 24)
  output.writeUInt32LE(sampleRate * 2, 28)
  output.writeUInt16LE(2, 32)
  output.writeUInt16LE(16, 34)
  output.write('data', 36)
  output.writeUInt32LE(dataSize, 40)
  const root = 220 + (seedText.length % 4) * 12
  const ratios = [1, 5 / 4, 3 / 2, 4 / 3]
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate
    const chord = Math.min(ratios.length - 1, Math.floor(time / 3))
    const localTime = time % 3
    const envelope = Math.min(1, localTime * 1.4) * Math.min(1, (3 - localTime) * 1.2)
    const frequency = root * ratios[chord]
    const value = Math.sin(2 * Math.PI * frequency * time) * 0.018
      + Math.sin(2 * Math.PI * frequency * 2 * time) * 0.006
      + Math.sin(2 * Math.PI * frequency * 0.5 * time) * 0.008
    output.writeInt16LE(Math.round(value * envelope * 32767), 44 + index * 2)
  }
  return output
}
