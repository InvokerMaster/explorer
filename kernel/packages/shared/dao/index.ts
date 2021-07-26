import defaultLogger from '../logger'
import future from 'fp-future'
import {
  Layer,
  Realm,
  Candidate,
  RootDaoState,
  ServerConnectionStatus,
  PingResult,
  HealthStatus,
  LayerBasedCandidate,
  IslandsBasedCandidate
} from './types'
import { Store } from 'redux'
import {
  isRealmInitialized,
  getCatalystRealmCommsStatus,
  getRealm,
  getAllCatalystCandidates,
  areCandidatesFetched
} from './selectors'
import { fetchCatalystNodesFromDAO } from 'shared/web3'
import { setCatalystRealm, setCatalystCandidates } from './actions'
import { deepEqual } from 'atomicHelpers/deepEqual'
import { worldToGrid } from 'atomicHelpers/parcelScenePositions'
import { lastPlayerPosition } from 'shared/world/positionThings'
import { countParcelsCloseTo, ParcelArray } from 'shared/comms/interface/utils'
import { CatalystNode } from '../types'
import { zip } from './utils/zip'
import { realmToString } from './utils/realmToString'
import { PIN_CATALYST } from 'config'
import * as qs from 'query-string'
import { store } from 'shared/store/isolatedStore'

const DEFAULT_TIMEOUT = 5000

const v = 50
// See here: https://github.com/decentraland/explorer/pull/604
const layerScore = ({ usersCount, maxUsers = 50 }: Layer) => {
  if (usersCount === 0) {
    return -v
  }
  if (usersCount >= maxUsers) {
    // We prefer empty layers to full layers
    return -10 * v
  }

  const phase = -Math.PI / 1.8

  const period = Math.PI / (0.67 * (maxUsers ? maxUsers : 50))

  return v + v * Math.cos(phase + period * usersCount)
}

// When using islands, the more users the better. We also prioritize these over the old lighthouses.
// That means the score starts over 100 for any candidate that has at least 1 user.
// We should probably revamp score altogether
const islandsScore = (usersCount: number) => {
  if (usersCount === 0) {
    return -v + 1 // if we have two empty realms, one old and one new, we prioritize the new one
  }

  return 100 + usersCount
}

export function ping(url: string, timeoutMs: number = 5000): Promise<PingResult> {
  const result = future<PingResult>()

  new Promise(() => {
    const http = new XMLHttpRequest()

    let started: Date

    http.timeout = timeoutMs

    http.onreadystatechange = () => {
      if (http.readyState === XMLHttpRequest.OPENED) {
        started = new Date()
      }
      if (http.readyState === XMLHttpRequest.DONE) {
        try {
          const ended = new Date().getTime()
          if (http.status !== 200) {
            result.resolve({
              status: ServerConnectionStatus.UNREACHABLE
            })
          } else {
            result.resolve({
              status: ServerConnectionStatus.OK,
              elapsed: ended - started.getTime(),
              result: JSON.parse(http.responseText)
            })
          }
        } catch (e) {
          defaultLogger.error('Error fetching status of Catalyst server', e)
          result.resolve({})
        }
      }
    }

    http.open('GET', url, true)

    try {
      http.send(null)
    } catch (exception) {
      result.resolve({
        status: ServerConnectionStatus.UNREACHABLE
      })
    }
  }).catch(defaultLogger.error)

  return result
}

async function fetchCatalystNodes(endpoint: string | undefined) {
  if (endpoint) {
    try {
      const response = await fetch(endpoint)
      if (response.ok) {
        const nodes = await response.json()
        return nodes.map((node: any) => ({ ...node, domain: node.address }))
      } else {
        throw new Error('Response was not OK. Status was: ' + response.statusText)
      }
    } catch (e) {
      defaultLogger.warn(`Tried to fetch catalysts from ${endpoint} but failed. Falling back to DAO contract`, e)
    }
  }

  return fetchCatalystNodesFromDAO()
}

export async function fetchCatalystRealms(nodesEndpoint: string | undefined): Promise<Candidate[]> {
  const nodes: CatalystNode[] = PIN_CATALYST ? [{ domain: PIN_CATALYST }] : await fetchCatalystNodes(nodesEndpoint)
  if (nodes.length === 0) {
    throw new Error('no nodes are available in the DAO for the current network')
  }

  const responses = await Promise.all(
    nodes.map(async (node) => ({ ...node, health: await fetchPeerHealthStatus(node) }))
  )

  const healthyNodes = responses.filter((node) => isPeerHealthy(node.health))

  return fetchCatalystStatuses(healthyNodes)
}

async function fetchPeerHealthStatus(node: CatalystNode) {
  const abortController = new AbortController()

  const signal = abortController.signal
  try {
    setTimeout(() => {
      abortController.abort()
    }, DEFAULT_TIMEOUT)

    const response = await (await fetch(peerHealthStatusUrl(node.domain), { signal })).json()

    return response
  } catch {
    return {}
  }
}

export function isPeerHealthy(peerStatus: Record<string, HealthStatus>) {
  return (
    Object.keys(peerStatus).length > 0 &&
    !Object.keys(peerStatus).some((server) => {
      return peerStatus[server] !== HealthStatus.HEALTHY
    })
  )
}

export function peerHealthStatusUrl(domain: string) {
  return `${domain}/lambdas/health`
}

export function commsStatusUrl(domain: string, includeLayers: boolean = false) {
  let url = `${domain}/comms/status`
  if (includeLayers) {
    url += `?includeLayers=true`
  }
  return url
}

export async function fetchCatalystStatuses(nodes: { domain: string }[]) {
  const results: PingResult[] = await Promise.all(nodes.map((node) => ping(commsStatusUrl(node.domain, true))))

  return zip(nodes, results).reduce(
    (union: Candidate[], [{ domain }, { elapsed, result, status }]: [CatalystNode, PingResult]) => {
      function buildBaseCandidate() {
        return {
          catalystName: result!.name,
          domain,
          status: status!,
          elapsed: elapsed!,
          lighthouseVersion: result!.version,
          catalystVersion: result!.env.catalystVersion
        }
      }

      function buildLayerCandidate(layer: Layer): LayerBasedCandidate {
        return {
          ...buildBaseCandidate(),
          layer,
          type: 'layer-based',
          score: layerScore(layer)
        }
      }

      function buildIslandsCandidate(usersCount: number): IslandsBasedCandidate {
        return {
          ...buildBaseCandidate(),
          usersCount,
          type: 'islands-based',
          score: islandsScore(usersCount)
        }
      }

      if (status === ServerConnectionStatus.OK) {
        if (result!.layers) {
          return [...union, ...result!.layers.map((layer) => buildLayerCandidate(layer))]
        } else {
          return [...union, buildIslandsCandidate(result!.usersCount!)]
        }
      } else return union
    },
    new Array<Candidate>()
  )
}

function candidateUsers(candidate: Candidate) {
  return candidate.type === 'layer-based' ? candidate.layer.usersCount : candidate.usersCount
}

export function pickCatalystRealm(candidates: Candidate[]): Realm {
  const usersByDomain: Record<string, number> = {}

  candidates.forEach((it) => {
    if (!usersByDomain[it.domain]) {
      usersByDomain[it.domain] = 0
    }

    usersByDomain[it.domain] += candidateUsers(it)
  })

  const sorted = candidates
    .filter((it) => it)
    .filter(
      (it) =>
        it.status === ServerConnectionStatus.OK &&
        (it.type === 'islands-based' || it.layer.usersCount < it.layer.maxUsers)
    )
    .sort((c1, c2) => {
      const elapsedDiff = c1.elapsed - c2.elapsed
      const usersDiff = usersByDomain[c1.domain] - usersByDomain[c2.domain]
      const scoreDiff = c2.score - c1.score

      return Math.abs(elapsedDiff) > 1500
        ? elapsedDiff // If the latency difference is greater than 1500, we consider that as the main factor
        : scoreDiff !== 0
        ? scoreDiff // If there's score difference, we consider that
        : usersDiff !== 0
        ? usersDiff // If the score is the same (as when they are empty)
        : elapsedDiff // If the candidates have the same score by users, we consider the latency again
    })

  if (sorted.length === 0 && candidates.length > 0) {
    throw new Error('No available realm found!')
  }

  return candidateToRealm(sorted[0])
}

export async function candidatesFetched(): Promise<void> {
  if (areCandidatesFetched(store.getState())) {
    return
  }

  return new Promise((resolve) => {
    const unsubscribe = store.subscribe(() => {
      const fetched = areCandidatesFetched(store.getState())
      if (fetched) {
        unsubscribe()
        return resolve()
      }
    })
  })
}

export async function realmInitialized(): Promise<void> {
  if (isRealmInitialized(store.getState())) {
    return
  }

  return new Promise((resolve) => {
    const unsubscribe = store.subscribe(() => {
      if (isRealmInitialized(store.getState())) {
        unsubscribe()
        return resolve()
      }
    })
  })
}

export function getRealmFromString(realmString: string, candidates: Candidate[]) {
  const parts = realmString.split('-')
  if (parts.length === 2) {
    return realmForLayer(parts[0], parts[1], candidates)
  } else {
    return realmFor(parts[0], candidates)
  }
}

function candidateToRealm(candidate: Candidate) {
  const realm: Realm = {
    catalystName: candidate.catalystName,
    domain: candidate.domain,
    lighthouseVersion: candidate.lighthouseVersion
  }

  if (candidate.type === 'layer-based') {
    realm.layer = candidate.layer.name
  }

  return realm
}

function realmForLayer(name: string, layer: string, candidates: Candidate[]): Realm | undefined {
  const candidate = candidates.find(
    (it) => it?.type === 'layer-based' && it.catalystName === name && it.layer.name === layer
  )
  return candidate ? candidateToRealm(candidate) : undefined
}

function realmFor(name: string, candidates: Candidate[]): Realm | undefined {
  const candidate = candidates.find((it) => it?.type === 'islands-based' && it.catalystName === name)
  return candidate ? candidateToRealm(candidate) : undefined
}

export function changeRealm(realmString: string) {
  const candidates = getAllCatalystCandidates(store.getState())

  const realm = getRealmFromString(realmString, candidates)

  if (realm) {
    store.dispatch(setCatalystRealm(realm))
  }

  return realm
}

export async function changeToCrowdedRealm(): Promise<[boolean, Realm]> {
  // TODO: Add support for changing to crowded realm in islands based candidates. Or remove this functionality

  const candidates = await refreshCandidatesStatuses()

  const currentRealm = getRealm(store.getState())!

  const positionAsVector = worldToGrid(lastPlayerPosition)
  const currentPosition = [positionAsVector.x, positionAsVector.y] as ParcelArray

  type RealmPeople = { realm: Realm; closePeople: number }

  let crowdedRealm: RealmPeople = { realm: currentRealm, closePeople: 0 }

  candidates
    .filter(
      (it) =>
        it.type === 'layer-based' &&
        it.layer.usersParcels &&
        it.layer.usersParcels.length > 0 &&
        it.layer.usersCount < it.layer.maxUsers
    )
    .forEach((candidate) => {
      const layer = (candidate as LayerBasedCandidate).layer
      if (layer.usersParcels) {
        let closePeople = countParcelsCloseTo(currentPosition, layer.usersParcels, 4)
        // If it is the realm of the player, we substract 1 to not count ourselves
        if (candidate.catalystName === currentRealm.catalystName && layer.name === currentRealm.layer) {
          closePeople -= 1
        }

        if (closePeople > crowdedRealm.closePeople) {
          crowdedRealm = {
            realm: candidateToRealm(candidate),
            closePeople
          }
        }
      }
    })

  if (!deepEqual(crowdedRealm.realm, currentRealm)) {
    store.dispatch(setCatalystRealm(crowdedRealm.realm))
    await catalystRealmConnected()
    return [true, crowdedRealm.realm]
  } else {
    return [false, currentRealm]
  }
}

export async function refreshCandidatesStatuses() {
  const candidates = await fetchCatalystStatuses(Array.from(getCandidateDomains(store)).map((it) => ({ domain: it })))

  store.dispatch(setCatalystCandidates(candidates))

  return candidates
}

function getCandidateDomains(store: Store<RootDaoState>): Set<string> {
  return new Set(getAllCatalystCandidates(store.getState()).map((it) => it.domain))
}

export async function catalystRealmConnected(): Promise<void> {
  const status = getCatalystRealmCommsStatus(store.getState())

  if (status.status === 'connected') {
    return Promise.resolve()
  } else if (status.status === 'error' || status.status === 'realm-full') {
    return Promise.reject(status.status)
  }

  return new Promise((resolve, reject) => {
    const unsubscribe = store.subscribe(() => {
      const status = getCatalystRealmCommsStatus(store.getState())
      if (status.status === 'connected') {
        resolve()
        unsubscribe()
      } else if (status.status === 'error' || status.status === 'realm-full') {
        reject(status.status)
        unsubscribe()
      }
    })
  })
}

export function observeRealmChange(
  store: Store<RootDaoState>,
  onRealmChange: (previousRealm: Realm | undefined, currentRealm: Realm) => any
) {
  let currentRealm: Realm | undefined = getRealm(store.getState())
  store.subscribe(() => {
    const previousRealm = currentRealm
    currentRealm = getRealm(store.getState())
    if (currentRealm && !deepEqual(previousRealm, currentRealm)) {
      onRealmChange(previousRealm, currentRealm)
    }
  })
}

export function initializeUrlRealmObserver() {
  observeRealmChange(store, (previousRealm, currentRealm) => {
    const q = qs.parse(location.search)
    const realmString = realmToString(currentRealm)

    q.realm = realmString

    history.replaceState({ realm: realmString }, '', `?${qs.stringify(q)}`)
  })
}
