import { writeFile } from 'node:fs/promises'

/** Test-only access to an explicitly selected, isolated Electron main process. */
export async function desktopCommand(port, home, operation) {
  if (!/^\d+$/.test(port ?? '') || !home) throw new Error('An isolated desktop main port and DSH_TEST_DESKTOP_HOME are required')
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })
  const targets = await response.json()
  const endpoint = new URL(targets[0]?.webSocketDebuggerUrl)
  if (endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1' || endpoint.port !== port) throw new Error('Refusing a non-loopback inspector')
  const socket = new WebSocket(endpoint)
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Desktop inspector connection timed out')), 5000)
      socket.onopen = () => { clearTimeout(timer); resolve() }
      socket.onerror = () => { clearTimeout(timer); reject(new Error('Desktop inspector connection failed')) }
    })
    const message = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Native desktop capture timed out')), 15000)
      socket.onmessage = event => {
        const value = JSON.parse(event.data)
        if (value.id !== 1) return
        clearTimeout(timer)
        resolve(value)
      }
      // DSH_HOME is checked before touching a window, even if the wrong port was supplied.
      const expression = `(async()=>{
        if (process.env.DSH_HOME !== ${JSON.stringify(home)}) throw new Error('Isolated desktop home does not match');
        const {BrowserWindow}=process.getBuiltinModule('module').createRequire(process.execPath)('electron');
        const window=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('dsh-app://app/'));
        if (!window) throw new Error('Isolated workspace window not found');
        ${operation}
      })()`
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
    if (message.error || message.result?.exceptionDetails) throw new Error('Isolated desktop operation failed: ' + JSON.stringify(message.error ?? message.result.exceptionDetails))
    return message.result.result.value
  } finally { socket.close() }
}

export async function captureDesktop(port, home, path) {
  // Electron's native capturer drives a frame while the test window stays hidden.
  // CDP Page.captureScreenshot may stall for a hidden Windows BrowserWindow.
  const png = await desktopCommand(port, home, `const contents=window.webContents;
    const throttled=contents.getBackgroundThrottling(); contents.setBackgroundThrottling(false);
    try {
      await contents.capturePage(undefined,{stayHidden:true,stayAwake:true});
      await new Promise(resolve=>setTimeout(resolve,650));
      return (await contents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64');
    } finally { contents.setBackgroundThrottling(throttled); }`)
  await writeFile(path, Buffer.from(png, 'base64'))
}
