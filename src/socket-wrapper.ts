import type { Socket } from 'net'
import type { Buffer } from 'buffer'
import type { NetSocketLike } from './react-native-tcp-adapter.js'

type CompatibleSocket = Socket | NetSocketLike

class SocketWrapper {
  public onopen?: () => void
  public onclose?: () => void
  public onerror?: (error: { message: string }) => void
  public onmessage?: (event: { data: ArrayBuffer }) => void
  public send: (message: Buffer) => void
  public close: () => void

  constructor(connection: string, socket: CompatibleSocket) {
    socket.on('connect', () => {
      this.onopen && this.onopen()
    })

    socket.on('close', () => {
      this.onclose && this.onclose()
      socket.removeAllListeners()
    })

    socket.on('error', (error) => {
      this.onerror && this.onerror({ message: error?.message || String(error) })
    })

    socket.on('data', (data: Buffer) => {
      const arrayBuffer = data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength
      ) as ArrayBuffer
      this.onmessage && this.onmessage({ data: arrayBuffer })
    })

    this.send = (message: Buffer) => {
      socket.write(message as any)
    }

    this.close = () => {
      socket.end()
    }

    const url = new URL(connection)
    const { host } = url
    const [nodeIP, port] = host.split(':')

    socket.connect(parseInt(port), nodeIP)
  }
}

export default SocketWrapper
