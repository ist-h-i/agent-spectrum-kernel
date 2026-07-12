import { AuthError } from './errors.mjs';
import { hashRefreshToken } from './tokens.mjs';

export class AuthService {
  constructor({ sessions, accounts, tokenIssuer, clock }) {
    this.sessions = sessions;
    this.accounts = accounts;
    this.tokenIssuer = tokenIssuer;
    this.clock = clock;
  }

  async login(accountId) {
    const account = this.accounts.getById(accountId);
    if (!account?.active) throw new AuthError();
    const refreshToken = this.tokenIssuer.issueRefreshToken();
    const session = {
      id: this.tokenIssuer.issueSessionId(),
      accountId: account.id,
      tenantId: account.tenantId,
      role: account.role,
      refreshHash: hashRefreshToken(refreshToken),
      expiresAt: this.clock.now() + 3_600_000
    };
    this.sessions.create(session);
    return {
      refreshToken,
      accessToken: await this.tokenIssuer.issueAccessToken(account),
      expiresAt: session.expiresAt
    };
  }

  async refresh(rawRefreshToken) {
    if (typeof rawRefreshToken !== 'string' || rawRefreshToken.length < 8) throw new AuthError();
    const currentHash = hashRefreshToken(rawRefreshToken);
    const session = this.sessions.findByRefreshHash(currentHash);
    if (!session) throw new AuthError();
    if (session.expiresAt < this.clock.now()) throw new AuthError('Session expired');

    const nextRefreshToken = this.tokenIssuer.issueRefreshToken();
    await this.sessions.rotate(session.id, currentHash, hashRefreshToken(nextRefreshToken));
    const accessToken = await this.tokenIssuer.issueAccessToken({
      id: session.accountId,
      tenantId: session.tenantId,
      role: session.role
    });

    return { accessToken, refreshToken: nextRefreshToken, expiresAt: session.expiresAt };
  }
}
