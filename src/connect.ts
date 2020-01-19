import defer from 'p-defer'
import PQueue from 'p-queue'
import { Connection, Session } from 'autobahn'
import { Interfaces, Identities } from '@incentum/crypto'
import { getNetworkVersion, WsUrl, WsRealm } from './const'
import { EllipticPrivateKey, DispatchResultJson, TemplateJson } from '@incentum/praxis-interfaces'

export interface Ledger {
  mnemonic: string
  ledger: string
}

export interface EffectError {
    msg: string
    token: string
    position: string
    line: string
    key: string
    effect: string
}

export type ISubscribe = (args: any[], ledger: string) => void
export const subscribe = (session: ISession, topic: string, subscribe: ISubscribe): void => {
  session.session.subscribe(topic, (args, kw, details: any) => {
    const ledger = details.publisher_authid
    try {
      subscribe(args, ledger)
    } catch (e) {
      // Nothing to do
    }
  })
}

export const subscribeQueue = (session: ISession, topic: string, queue: PQueue, subscribe: ISubscribe): void => {
  session.session.subscribe(topic, (args, kw, details: any) => {
    const ledger = details.publisher_authid
    try {
      queue.add(() => subscribe(args, ledger))
    } catch (e) {
      // Nothing to do
    }
  })

}

export const call = async (session: ISession, rpc: string, args: any[]): Promise<any> => {
  return session.session.call<any>(rpc, args)
}

export const callQueue = async (session: ISession, rpc: string, args: any[], queue: PQueue): Promise<any> => {
  return queue.add(() => session.session.call<any>(rpc, args))
}

type RunEffectResult = DispatchResultJson | EffectError
export const runEffect = async (session: ISession, template: TemplateJson, reducer: string, state: any, form: any): Promise<RunEffectResult> => {
  const args = [template, reducer, state, form]
  return session.session.call<RunEffectResult>(RunEffect, args)
}

export const runEffectQueue = async (session: ISession, queue: PQueue, template: TemplateJson, reducer: string, state: any, form: any): Promise<RunEffectResult> => {
  const args = [template, reducer, state, form]
  return queue.add(() => session.session.call<RunEffectResult>(RunEffect, args))
}

export const createLedger = (mnemonic: string): Ledger => {
  return {
    ledger: Identities.Address.fromPassphrase(mnemonic, getNetworkVersion()),
    mnemonic,
  }
}

const sessions = new Map<string, defer.DeferredPromise<Session>>()
export const getSession = async (ledger: string): Promise<Session> => {
  const deferred = sessions.get(ledger)
  if (!deferred) { throw new Error('session not found') }
  return deferred.promise
}

export function signKey(key: string, ledger: Ledger): [string, string] {
  const keyPair: Interfaces.IKeyPair = Identities.Keys.fromPassphrase(ledger.mnemonic)
  const privateKey = new EllipticPrivateKey(keyPair.privateKey)
  return [privateKey.sign(key), keyPair.publicKey]
}

export interface ISession {
  session: Session
}
export type StartSession = (session: ISession, ledger: string) => void

export const anonymous = 'anonymous'
export const anonymousLedger = {
  ledger: anonymous, 
  mnemonic: '',
}
export const isAnonymous = (ledger: Ledger) => ledger.ledger = anonymous

export const initializeAnonymous = async (startSession: StartSession) => {
  return initializeLedger(anonymousLedger, startSession)
}

const challengeString = 'challengeme'
export const initializeLedger = async (ledger: Ledger, startSession: StartSession) => {
  sessions.set(ledger.ledger, defer<Session>())

  let challenge
  let signature
  let publicKey
  if (!isAnonymous(ledger)) {
    challenge = `${challengeString}-${Date.now()}`;
    [signature, publicKey] = signKey(challenge, ledger)
  }

  const opts: any = {
    url: WsUrl,
    realm: WsRealm,
    authid: ledger.ledger,
    authextra: {
      ledger: ledger.ledger,
      challenge,
      signature,
      publicKey,
    },
  }
  const connection = new Connection(opts)
  connection.onopen = (session: Session, details: any) => {
    const deferred = sessions.get(details.authid)!
    deferred.resolve(session)
    startSession({ session }, details.authid)
  }
  connection.onclose = (reason: string, details: any): boolean => {
    sessions.set(details.authid, defer<Session>())
    return false
  }
  connection.open()

  ping(ledger.ledger)

}

export const RPCPing = 'network.incentum.praxis.code.ping'
export const RunEffect = 'network.m0.praxis.code.effect.run'

const delay = async (ms: number): Promise<any> => {
  const deferred = defer()
  setTimeout(() => deferred.resolve(), ms)
  return deferred.promise
}

const PingInterval = 1000 * 20 // twenty seconds
export const ping = async (ledger: string): Promise<any> => {
  while (true) {
    await delay(PingInterval)
    try {
      const session = await getSession(ledger)
      await session.call<any>(RPCPing, [ledger])
    } catch (e) {
      // Nothing to do
    }
  }
}
