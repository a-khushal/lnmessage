/**
 * React Native TCP Socket Adapter
 *
 * This adapter wraps react-native-tcp-socket to provide a Node.js net.Socket-compatible
 * interface for use with lnmessage in React Native environments.
 *
 * Usage:
 * ```typescript
 * import TcpSocket from 'react-native-tcp-socket'
 * import { createReactNativeTcpSocket } from './react-native-tcp-adapter'
 *
 * const socket = createReactNativeTcpSocket(TcpSocket)
 * const ln = new LnMessage({
 *   remoteNodePublicKey: '...',
 *   ip: '...',
 *   port: 9735,
 *   tcpSocket: socket
 * })
 * ```
 */

import type { Buffer } from 'buffer'

// Type definition matching Node.js net.Socket interface
export interface NetSocketLike {
  connect(port: number, host: string, callback?: () => void): void
  write(data: Buffer | string, encoding?: string, callback?: () => void): boolean
  end(data?: Buffer | string, encoding?: string, callback?: () => void): void
  destroy(): void
  removeAllListeners(event?: string | symbol): this
  on(event: 'connect', listener: () => void): this
  on(event: 'data', listener: (data: Buffer) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'close', listener: () => void): this
  on(event: string | symbol, listener: (...args: any[]) => void): this
}

// Type for react-native-tcp-socket's socket instance
interface ReactNativeTcpSocketInstance {
  write(data: Buffer | string, encoding?: string, callback?: () => void): boolean
  end(data?: Buffer | string, encoding?: string, callback?: () => void): void
  destroy(): void
  removeAllListeners(event?: string | symbol): this
  on(event: 'connect', listener: () => void): this
  on(event: 'data', listener: (data: Buffer) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'close', listener: () => void): this
  on(event: string | symbol, listener: (...args: any[]) => void): this
}

// Type for react-native-tcp-socket module
interface ReactNativeTcpSocketModule {
  createConnection(
    options: { host: string; port: number },
    callback?: () => void
  ): ReactNativeTcpSocketInstance
}

/**
 * Creates a Node.js net.Socket-compatible adapter for react-native-tcp-socket
 *
 * This function creates a socket instance that matches the interface expected
 * by SocketWrapper, allowing lnmessage to work in React Native.
 *
 * @param TcpSocketModule - The react-native-tcp-socket module
 * @returns A socket-like object compatible with Node.js net.Socket
 */
export function createReactNativeTcpSocket(
  TcpSocketModule: ReactNativeTcpSocketModule
): NetSocketLike {
  let socketInstance: ReactNativeTcpSocketInstance | null = null
  const pendingListeners: Array<{ event: string | symbol; listener: (...args: any[]) => void }> = []
  let isConnected = false

  // Create a socket adapter that implements the net.Socket interface
  const socketAdapter: NetSocketLike = {
    connect(port: number, host: string, callback?: () => void): void {
      if (socketInstance) {
        return
      }

      try {
        // Create the react-native-tcp-socket connection
        // react-native-tcp-socket uses createConnection with options object
        socketInstance = TcpSocketModule.createConnection({ host, port }, () => {
          const connectListeners: Array<() => void> = []
          pendingListeners.forEach(({ event, listener }) => {
            if (event === 'connect') {
              connectListeners.push(listener as () => void)
            } else {
              socketInstance!.on(event, listener as any)
            }
          })
          pendingListeners.length = 0

          // Mark as connected
          isConnected = true

          connectListeners.forEach((listener) => {
            try {
              listener()
            } catch (error) {
              console.error(`[TCP Adapter] Error in connect listener:`, error)
            }
          })

          // Call the connect callback if provided
          if (callback) {
            callback()
          }
        })

        // Add error listener immediately after creating socket
        socketInstance.on('error', (error: Error) => {
          console.error(`[TCP Adapter] Connection error to ${host}:${port}:`, error)
        })

        socketInstance.on('close', () => {
          isConnected = false
        })
      } catch (error) {
        console.error(`[TCP Adapter] Failed to create connection to ${host}:${port}:`, error)
        throw error
      }
    },

    write(data: Buffer | string, encoding?: string, callback?: () => void): boolean {
      if (!socketInstance) {
        return false
      }
      return socketInstance.write(data, encoding, callback)
    },

    end(data?: Buffer | string, encoding?: string, callback?: () => void): void {
      if (socketInstance) {
        socketInstance.end(data, encoding, callback)
      }
    },

    destroy(): void {
      if (socketInstance) {
        socketInstance.destroy()
        socketInstance = null
      }
      pendingListeners.length = 0
    },

    removeAllListeners(event?: string | symbol): NetSocketLike {
      if (socketInstance) {
        socketInstance.removeAllListeners(event)
      }
      if (!event) {
        // Remove all pending listeners if removing all
        pendingListeners.length = 0
      } else {
        // Remove specific pending listener
        const index = pendingListeners.findIndex((p) => p.event === event)
        if (index !== -1) {
          pendingListeners.splice(index, 1)
        }
      }
      return socketAdapter
    },

    // Forward EventEmitter methods to the underlying socket instance
    on(event: string | symbol, listener: (...args: any[]) => void): NetSocketLike {
      if (socketInstance && isConnected && event === 'connect') {
        try {
          ;(listener as () => void)()
        } catch (error) {
          console.error(`[TCP Adapter] Error in connect listener:`, error)
        }
      } else if (socketInstance) {
        socketInstance.on(event, listener as any)
      } else {
        pendingListeners.push({ event, listener })
      }
      return socketAdapter
    }
  }

  return socketAdapter
}
