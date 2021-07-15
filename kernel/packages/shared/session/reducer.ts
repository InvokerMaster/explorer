import { AnyAction } from 'redux'

import { SessionState } from './types'
import {
  CHANGE_LOGIN_STAGE,
  SIGNUP_CLEAR_DATA,
  SIGNUP_FORM,
  SIGNUP_SET_IDENTITY,
  SIGNUP_SET_IS_SIGNUP,
  SIGNUP_SET_PROFILE,
  SignUpFormAction,
  SignUpSetIdentityAction,
  SignUpSetProfileAction,
  USER_AUTHENTIFIED,
  UserAuthentified
} from './actions'
import { LoginStage } from '../../../../anti-corruption-layer/kernel-types'

const SIGNUP_INITIAL_STATE = {
  stage: '',
  profile: {},
  userId: undefined,
  identity: undefined
}

const INITIAL_STATE: SessionState = {
  initialized: false,
  identity: undefined,
  userId: undefined,
  network: undefined,
  loginStage: LoginStage.LOADING,
  isSignUp: false,
  signup: SIGNUP_INITIAL_STATE
}

export function sessionReducer(state?: SessionState, action?: AnyAction): SessionState {
  if (!state) {
    return INITIAL_STATE
  }
  if (!action) {
    return state
  }
  switch (action.type) {
    case USER_AUTHENTIFIED: {
      return { ...state, initialized: true, ...(action as UserAuthentified).payload }
    }
    case CHANGE_LOGIN_STAGE: {
      return { ...state, loginStage: action.payload.stage }
    }
    case SIGNUP_FORM:
      const { name, email } = (action as SignUpFormAction).payload
      return {
        ...state,
        signup: {
          ...state.signup,
          profile: {
            ...state.signup.profile,
            unclaimedName: name,
            email
          }
        }
      }
    case SIGNUP_SET_PROFILE: {
      const { name, email, ...values } = (action as SignUpSetProfileAction).payload
      return {
        ...state,
        signup: {
          ...state.signup,
          profile: {
            ...state.signup.profile,
            ...values
          }
        }
      }
    }
    case SIGNUP_SET_IDENTITY: {
      return {
        ...state,
        signup: {
          ...state.signup,
          ...(action as SignUpSetIdentityAction).payload
        }
      }
    }
    case SIGNUP_CLEAR_DATA: {
      return {
        ...state,
        signup: SIGNUP_INITIAL_STATE
      }
    }
    case SIGNUP_SET_IS_SIGNUP: {
      return {
        ...state,
        isSignUp: action.payload.isSignUp
      }
    }
  }
  return state
}
