export interface User {
  entityKey: string
  name: string
  email: string
  phone?: string
  city?: string
  birthDate?: string
  idNumber?: string
  canCharge?: boolean
  familyMembers?: FamilyMember[]
}

export interface FamilyMember {
  entityKey?: string
  name: string
  relation?: string
  phone?: string
  email?: string
  birthDate?: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthResult {
  success: boolean
  message?: string
  details?: string[]
  status?: number
}

export interface RegistrationPayload {
  name: string
  email: string
  password: string
  phone?: string
  idNumber?: string
  birthDate?: string
  city?: string
  canCharge?: boolean
  familyMembers?: Omit<FamilyMember, "entityKey">[]
}
