import defer from 'p-defer'
import PQueue from 'p-queue'
import { getNetworkVersion, WsUrl, WsRealm } from './const'
import { Connection, Session } from 'autobahn'
import { Interfaces, Identities } from '@incentum/crypto'
import { EllipticPrivateKey } from '@incentum/praxis-interfaces'

export interface Ledger {
  mnemonic: string
  ledger: string
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

export const initializeLedger = async (ledger: Ledger, startSession: StartSession) => {
  sessions.set(ledger.ledger, defer<Session>())

  const challenge = `${'challenge'}-${Date.now()}`
  const [signature, publicKey] = signKey(challenge, ledger)

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
