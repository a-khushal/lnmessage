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

  constructor(connection: string | { ip: string; port: number }, socket: CompatibleSocket) {
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

    let nodeIP: string
    let port: number

    if (typeof connection === 'string') {
      try {
        const url = new URL(connection)
        const host = url.host || url.hostname
        if (host.includes(':')) {
          const [ip, portStr] = host.split(':')
          nodeIP = ip
          port = parseInt(portStr, 10)
        } else {
          nodeIP = host
          port = parseInt(url.port || '9735', 10)
        }
      } catch {
        const parts = connection.split(':')
        if (parts.length === 2) {
          nodeIP = parts[0]
          port = parseInt(parts[1], 10)
        } else {
          throw new Error(`Invalid connection string: ${connection}`)
        }
      }
    } else {
      nodeIP = connection.ip
      port = connection.port
    }

    socket.connect(port, nodeIP)
  }
}

export default SocketWrapper
