import { Buffer } from 'buffer'

function ROTATE(v: number, c: number) {
  return (v << c) | (v >>> (32 - c))
}

const constants = Buffer.from('expand 32-byte k')

function readU32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] |
      (buf[offset + 1] << 8) |
      (buf[offset + 2] << 16) |
      (buf[offset + 3] << 24)) >>>
    0
  )
}

function writeU32LE(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff
  buf[offset + 1] = (value >>> 8) & 0xff
  buf[offset + 2] = (value >>> 16) & 0xff
  buf[offset + 3] = (value >>> 24) & 0xff
}

class Chacha20 {
  public input: Uint32Array
  public cachePos: number
  public buffer: Uint32Array
  public output: Buffer

  constructor(key: Buffer, nonce: Buffer) {
    const keyBuffer = Buffer.from(key)
    const nonceBuffer = Buffer.from(nonce)

    this.input = new Uint32Array(16)

    // https://tools.ietf.org/html/draft-irtf-cfrg-chacha20-poly1305-01#section-2.3
    this.input[0] = readU32LE(constants, 0)
    this.input[1] = readU32LE(constants, 4)
    this.input[2] = readU32LE(constants, 8)
    this.input[3] = readU32LE(constants, 12)
    this.input[4] = readU32LE(keyBuffer, 0)
    this.input[5] = readU32LE(keyBuffer, 4)
    this.input[6] = readU32LE(keyBuffer, 8)
    this.input[7] = readU32LE(keyBuffer, 12)
    this.input[8] = readU32LE(keyBuffer, 16)
    this.input[9] = readU32LE(keyBuffer, 20)
    this.input[10] = readU32LE(keyBuffer, 24)
    this.input[11] = readU32LE(keyBuffer, 28)

    this.input[12] = 0

    this.input[13] = readU32LE(nonceBuffer, 0)
    this.input[14] = readU32LE(nonceBuffer, 4)
    this.input[15] = readU32LE(nonceBuffer, 8)

    this.cachePos = 64
    this.buffer = new Uint32Array(16)
    this.output = Buffer.alloc(64)
  }

  quarterRound(a: number, b: number, c: number, d: number) {
    const x = this.buffer
    x[a] += x[b]
    x[d] = ROTATE(x[d] ^ x[a], 16)
    x[c] += x[d]
    x[b] = ROTATE(x[b] ^ x[c], 12)
    x[a] += x[b]
    x[d] = ROTATE(x[d] ^ x[a], 8)
    x[c] += x[d]
    x[b] = ROTATE(x[b] ^ x[c], 7)
  }

  makeBlock(output: Buffer, start: number) {
    let i = -1
    // copy input into working buffer
    while (++i < 16) {
      this.buffer[i] = this.input[i]
    }
    i = -1
    while (++i < 10) {
      // straight round
      this.quarterRound(0, 4, 8, 12)
      this.quarterRound(1, 5, 9, 13)
      this.quarterRound(2, 6, 10, 14)
      this.quarterRound(3, 7, 11, 15)

      //diaganle round
      this.quarterRound(0, 5, 10, 15)
      this.quarterRound(1, 6, 11, 12)
      this.quarterRound(2, 7, 8, 13)
      this.quarterRound(3, 4, 9, 14)
    }

    i = -1

    // copy working buffer into output
    while (++i < 16) {
      this.buffer[i] += this.input[i]
      writeU32LE(output, start, this.buffer[i])
      start += 4
    }

    this.input[12]++

    if (!this.input[12]) {
      throw new Error('counter is exausted')
    }
  }

  getBytes(len: number) {
    let dpos = 0
    const dst = Buffer.alloc(len)
    const cacheLen = 64 - this.cachePos

    if (cacheLen) {
      if (cacheLen >= len) {
        this.output.copy(dst, 0, this.cachePos, 64)
        this.cachePos += len
        return dst
      } else {
        this.output.copy(dst, 0, this.cachePos, 64)
        len -= cacheLen
        dpos += cacheLen
        this.cachePos = 64
      }
    }

    while (len > 0) {
      if (len <= 64) {
        this.makeBlock(this.output, 0)
        this.output.copy(dst, dpos, 0, len)
        if (len < 64) {
          this.cachePos = len
        }
        return dst
      } else {
        this.makeBlock(dst, dpos)
      }
      len -= 64
      dpos += 64
    }

    throw new Error('something bad happended')
  }
}

export default Chacha20
