import { userForToken, verificationRequired } from '../auth.js';
import { isHosted } from '../cloud.js';

// Supplied bad credentials cannot silently address the anonymous local store.
export async function copyOwnerForToken(token, supplied) {
  const hosted = isHosted();
  if (supplied && (typeof token !== 'string' || !token))
    throw Object.assign(new Error('Log in to copy this project.'), { code: 'unauthorized' });
  const user = token ? await userForToken(token) : null;
  if (!user && (supplied || hosted))
    throw Object.assign(new Error('Log in to copy this project.'), { code: 'unauthorized' });
  if (user && !user.verified && verificationRequired())
    throw Object.assign(new Error('Confirm your email before copying.'), { code: 'email-unverified' });
  return user?.email ?? null;
}
