type ToastType = 'success' | 'error' | 'info'
type Listener = (msg: string, type: ToastType, duration?: number) => void

let _listener: Listener | null = null

export const toast = {
  success: (msg: string, duration?: number) => _listener?.(msg, 'success', duration),
  error:   (msg: string, duration?: number) => _listener?.(msg, 'error',   duration),
  info:    (msg: string, duration?: number) => _listener?.(msg, 'info',    duration),
  _register:   (fn: Listener) => { _listener = fn },
  _unregister: ()             => { _listener = null },
}
