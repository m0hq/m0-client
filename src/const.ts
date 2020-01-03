const networks = {
  local: {
    networkVersion: 23,
  },
  testnet: {
    networkVersion: 23,
  },
  devnet: {
    networkVersion: 30,
  },
  mainnet: {
    networkVersion: 23,
  },
}

const network = 'testnet'

export const getNetworkVersion = () => networks[network].networkVersion

export const WsUrl = 'wss://m0n3t1z3.com/ws'
export const WsRealm = 'realm-praxis'
