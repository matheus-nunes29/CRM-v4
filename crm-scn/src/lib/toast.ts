export type ToastAction  = { label: string; onClick: () => void }
export type ToastOptions = { duration?: number; action?: ToastAction }
type ToastType = 'success' | 'error' | 'info'
type Listener  = (msg: string, type: ToastType, options?: ToastOptions) => void

let _listener: Listener | null = null

export const toast = {
  success: (msg: string, options?: ToastOptions) => _listener?.(msg, 'success', options),
  error:   (msg: string, options?: ToastOptions) => _listener?.(msg, 'error',   options),
  info:    (msg: string, options?: ToastOptions) => _listener?.(msg, 'info',    options),
  _register:   (fn: Listener) => { _listener = fn },
  _unregister: ()             => { _listener = null },
}
