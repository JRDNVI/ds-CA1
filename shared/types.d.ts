//export type Language = 'English' | 'French'

export type Game = {
  id: number,
  version: number,
  title: string,
  description: string,
  rating: number,
  genre: string,
  developer: string,
  adult: boolean
}

export type ConfirmSignUpBody = {
  username: string;
  code: string;
}

export type SignInBody = {
  username: string;
  password: string;
}

export type SignUpBody = {
  username: string;
  password: string;
  email: string
}