// Stub auth for personal use - returns fake session
export async function getServerSession() {
  return { user: { id: 'local', email: 'trader@local', name: 'Trader' } };
}

export const authOptions = {};
