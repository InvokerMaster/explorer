import { AnyAction } from 'redux'
import { call, delay, fork, put, race, select, take, takeEvery, takeLatest } from 'redux-saga/effects'

import { RENDERER_INITIALIZED } from 'shared/renderer/types'
import { LOGIN_COMPLETED, USER_AUTHENTIFIED } from 'shared/session/actions'
import { web3initialized } from 'shared/dao/actions'
import { trackEvent } from '../analytics'
import { lastPlayerPosition } from '../world/positionThings'

import { SceneLoad, SCENE_FAIL, SCENE_LOAD, SCENE_START } from './actions'
import {
  setLoadingScreen,
  EXPERIENCE_STARTED,
  rotateHelpText,
  TELEPORT_TRIGGERED,
  unityClientLoaded,
  authSuccessful
} from './types'
import Html from '../Html'
import { getCurrentUserId } from 'shared/session/selectors'
import { onLoginCompleted } from 'shared/ethereum/provider'
import { RootState } from 'shared/store/rootTypes'

const SECONDS = 1000

export const DELAY_BETWEEN_MESSAGES = 10 * SECONDS

export function* loadingSaga() {
  yield fork(translateActions)

  yield fork(initialSceneLoading)
  yield takeLatest(TELEPORT_TRIGGERED, teleportSceneLoading)

  yield takeEvery(SCENE_LOAD, trackLoadTime)
}

function* translateActions() {
  yield takeEvery(RENDERER_INITIALIZED, triggerUnityClientLoaded)
  yield takeEvery(USER_AUTHENTIFIED, triggerWeb3Initialized)
  yield takeEvery(LOGIN_COMPLETED, triggerAuthSuccessful)
}

function* triggerAuthSuccessful() {
  yield put(authSuccessful())
}

function* triggerWeb3Initialized() {
  yield put(web3initialized())
}

function* triggerUnityClientLoaded() {
  yield put(unityClientLoaded())
}

export function* trackLoadTime(action: SceneLoad): any {
  const start = new Date().getTime()
  const sceneId = action.payload
  const result = yield race({
    start: take((action: AnyAction) => action.type === SCENE_START && action.payload === sceneId),
    fail: take((action: AnyAction) => action.type === SCENE_FAIL && action.payload === sceneId)
  })
  const userId = yield select(getCurrentUserId)
  const position = lastPlayerPosition
  trackEvent('SceneLoadTimes', {
    position: { ...position },
    elapsed: new Date().getTime() - start,
    success: !!result.start,
    sceneId,
    userId: userId
  })
}

function* refreshTeleport() {
  while (true) {
    yield delay(DELAY_BETWEEN_MESSAGES)
    yield put(rotateHelpText())
  }
}

function* refreshTextInScreen() {
  while (true) {
    const status = yield select((state) => state.loading)
    yield call(() => Html.updateTextInScreen(status))
    yield delay(600)
  }
}

export function* waitForSceneLoads() {
  while (true) {
    if (yield select((state: RootState) => state.loading.pendingScenes === 0)) {
      break
    }
    yield delay(600)
  }
}

export function* initialSceneLoading() {
  yield race({
    refresh: call(refreshTeleport),
    textInScreen: call(refreshTextInScreen),
    finish: call(function* () {
      yield take(EXPERIENCE_STARTED)
      yield onLoginCompleted()
      yield put(setLoadingScreen(false))
    })
  })
}

export function* teleportSceneLoading() {
  yield race({
    refresh: call(refreshTeleport),
    textInScreen: call(function* () {
      yield delay(2000)
      yield call(refreshTextInScreen)
    })
  })
  yield take(EXPERIENCE_STARTED)
  yield onLoginCompleted()
  yield put(setLoadingScreen(false))
}
