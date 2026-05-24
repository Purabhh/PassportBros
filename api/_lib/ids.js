import { customAlphabet } from 'nanoid';

// URL-safe, no ambiguous chars (no 0/O, 1/l/I). Long enough that brute-forcing
// invite tokens isn't feasible (62^20 = 7.04e35 possibilities).
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';

export const newGroupId = customAlphabet(alphabet, 20);     // invite token
export const newMemberToken = customAlphabet(alphabet, 32); // long-lived session
