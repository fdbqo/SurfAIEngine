import { getMockUser } from "./mockUserClient"
import { getUserFromDeviceStore } from "./services/deviceProfileService"
import type { User } from "@/types/user/User"

/** load user from device store, then mock fallback */
export async function getUserForAgent(userId: string): Promise<User | null> {
  const fromDevice = await getUserFromDeviceStore(userId)
  if (fromDevice) return fromDevice
  return getMockUser(userId)
}
