import * as path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

export interface IOptions {
  silent: boolean
  cmdPath?: string
  workingDir?: string
  env?: { [key: string]: string }
}

export interface IMatcherOptions {
  matchMany: boolean
}

export enum Response {
  YES = 'Yes\n',
  NO = 'no\n'
}

class Commando extends EventEmitter {
  private proc: ChildProcess
  private matchers: { pattern: RegExp; response: (mag: string) => string; options: IMatcherOptions }[] = []

  constructor(command: string, opts: IOptions = { silent: false, env: {} }) {
    super()
    const parts = command.split(' ')
    const cmd = opts.cmdPath ? path.resolve(opts.cmdPath, parts[0]) : parts[0]
    console.log('Running command:', cmd, opts.cmdPath, parts)
    if (process.platform === 'win32') {
      console.log('Windows spawn')
      this.proc = spawn(process.env.comspec, ['/c', cmd, ...parts.slice(1)], {
        env: { ...process.env, ...opts.env },
        cwd: opts.workingDir || process.cwd()
      })
    } else {
      this.proc = spawn(cmd, parts.slice(1), { env: { ...process.env, ...opts.env }, cwd: opts.workingDir || process.cwd() })
    }

    this.proc.stdout.on('data', data => {
      if (!opts.silent) {
        console.log(data.toString())
      } else {
        console.log('silent mode')
      }
      this.onData(data.toString())
    })

    this.proc.stderr.on('data', data => this.emit('err', data.toString()))
    this.proc.on('close', () => this.emit('end'))
  }

  when(pattern: string | RegExp, response: (msg: string) => string, options: IMatcherOptions = { matchMany: false }) {
    this.matchers.push({ pattern: new RegExp(pattern), response, options })
    return this
  }

  endWhen(pattern: string | RegExp, response: (msg: string) => string = () => null, options: IMatcherOptions = { matchMany: false }) {
    const cb = msg => {
      response(msg)
      this.proc.kill()
      return null
    }
    this.matchers.push({ pattern: new RegExp(pattern), response: cb, options })
    return this
  }

  private onData(data: string) {
    this.matchers.some((match, i) => {
      if (data.match(match.pattern)) {
        const res = match.response(data)
        if (res) {
          this.proc.stdin.write(res)
        }
        if (!match.options.matchMany) {
          this.matchers.splice(i, 1)
        }
        return true
      }
    })
  }
}

export default Commando
