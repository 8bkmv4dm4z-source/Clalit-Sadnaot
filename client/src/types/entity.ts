export interface Entity {
  entityKey: string
  name: string
  email?: string
  phone?: string
  city?: string
  birthDate?: string
  idNumber?: string
  relation?: string
  isFamily?: boolean
  canCharge?: boolean
  familyEntityKey?: string
  parentKey?: string
  parentName?: string
  parentEmail?: string
  parentPhone?: string
}

export interface EntityUpdate {
  entityKey: string
  updates: Partial<Omit<Entity, "entityKey">>
}
