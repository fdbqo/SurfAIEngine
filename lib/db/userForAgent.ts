import { getMockUser } from "./mockUserClient"
import { getUserFromDeviceStore } from "./services/deviceProfileService"
import type { User } from "@/types/user/User"

/**
 * Resolves the surf agent `User`: Mongo `deviceprofiles` first, then in-memory mock users (dev/tests).
 */
export async function getUserForAgent(userId: string): Promise<User | null> {
  const fromDevice = await getUserFromDeviceStore(userId)
  if (fromDevice) return fromDevice
  return getMockUser(userId)
}
