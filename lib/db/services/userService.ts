import connectDB from "../connect"
import { UserModel } from "../models/User"
import type { User } from "@/types/user/User"

// Create user
export async function createUser(userData: Omit<User, "createdAt" | "updatedAt">): Promise<User> {
  await connectDB()
  const user = new UserModel(userData)
  return await user.save()
}

// Find user by ID
export async function findUserById(id: string): Promise<User | null> {
  await connectDB()
  return await UserModel.findOne({ id }).lean()
}

// Update user by ID
export async function updateUser(
  id: string,
  updateData: Partial<Omit<User, "id" | "createdAt" | "updatedAt">>
): Promise<User | null> {
  await connectDB()
  return await UserModel.findOneAndUpdate(
    { id },
    { $set: updateData },
    { new: true, runValidators: true }
  ).lean()
}

// Delete user by ID
export async function deleteUser(id: string): Promise<boolean> {
  await connectDB()
  const result = await UserModel.findOneAndDelete({ id })
  return !!result
}

// Get all users (paginated)
export async function getAllUsers(
  limit: number = 100,
  skip: number = 0
): Promise<User[]> {
  await connectDB()
  return await UserModel.find().limit(limit).skip(skip).lean()
}

// Update user last location
export async function updateUserLastLocation(
  userId: string,
  lastLocation: User["lastLocation"]
): Promise<User | null> {
  await connectDB()
  return await UserModel.findOneAndUpdate(
    { id: userId },
    { $set: { lastLocation } },
    { new: true }
  ).lean()
}
