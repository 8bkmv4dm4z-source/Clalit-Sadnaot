export interface Workshop {
  wid: string
  title: string
  type?: string
  description?: string
  coach?: string
  city?: string
  address?: string
  studio?: string
  days?: string[]
  hour?: string
  price?: number
  ageGroup?: string
  image?: string
  available?: boolean
  adminHidden?: boolean
  maxParticipants?: number
  participants?: Participant[]
  participantsCount?: number
  waitingList?: WaitlistEntry[]
  waitingListCount?: number
  waitingListMax?: number
  familyRegistrationsCount?: number
  registrationStatus?: "registered" | "not_registered" | "waitlisted"
  isUserInWaitlist?: boolean
  isUserRegistered?: boolean
  startDate?: string
  endDate?: string
  inactiveDates?: string[]
  userFamilyRegistrations?: string[]
}

export interface Participant {
  entityKey?: string
  name?: string
}

export interface WaitlistEntry {
  entityKey?: string
  familyMemberKey?: string
  familyMemberId?: string
  parentKey?: string
}

export interface WorkshopFilters {
  type?: string
  ageGroup?: string
  city?: string
  coach?: string
  day?: string
  hour?: string
}
