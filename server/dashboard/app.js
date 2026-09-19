
const POLL_INTERVAL = 4000;
let previousPaymentCount = 0;
let pollTimer = null;

function getAdminToken() {
  return sessionStorage.getItem('arcx_admin_token');
}

function checkAuthState() {
  const token = getAdminToken();
  const overlay = document.getElementById('auth-overlay');
  if (!token) {
    if (overlay) overlay.classList.remove('hidden');
    return false;
  } else {
    if (overlay) overlay.classList.add('hidden');
    return true;
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const keyInput = document.getElementById('admin-key-input');
  const errorEl = document.getElementById('auth-error');
  const submitBtn = document.getElementById('btn-auth-submit');
  const key = keyInput ? keyInput.value.trim() : '';

  if (!key) return;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<iconify-icon icon="solar:restart-linear" class="animate-spin text-base"></iconify-icon> Verifying...';
  }
  if (errorEl) errorEl.classList.add('hidden');

  try {
    const res = await fetch('/api/v1/stats/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });

    if (!res.ok) {
      throw new Error('Authentication failed');
    }

    const data = await res.json();
    if (data.authenticated && data.token) {
      sessionStorage.setItem('arcx_admin_token', data.token);
      checkAuthState();
      fetchData();
      if (!pollTimer) {
        pollTimer = setInterval(fetchData, POLL_INTERVAL);
      }
    } else {
      throw new Error('Invalid authentication response');
    }
  } catch (err) {
    if (errorEl) errorEl.classList.remove('hidden');
    if (keyInput) {
      keyInput.value = '';
      keyInput.focus();
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<iconify-icon icon="solar:lock-unlocked-linear" class="text-base"></iconify-icon> Unlock Console';
    }
  }
}

function adminLogout() {
  sessionStorage.removeItem('arcx_admin_token');
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    const input = document.getElementById('admin-key-input');
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

async function fetchData() {
  if (!checkAuthState()) return;
  const token = getAdminToken();

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    const icon = refreshBtn.querySelector('iconify-icon');
    if (icon) icon.classList.add('animate-spin');
  }

  try {
    const statsRes = await fetch('/api/v1/stats?format=json');
    const stats = await statsRes.json();

    const revEl = document.getElementById('total-revenue');
    if (revEl && stats?.stats?.totalRevenue) {
      revEl.textContent = stats.stats.totalRevenue.replace(' USDC', '');
    }
    const payEl = document.getElementById('total-payments');
    if (payEl && stats?.stats) {
      payEl.textContent = stats.stats.totalSettled;
    }
    const walletEl = document.getElementById('unique-wallets');
    if (walletEl && stats?.stats) {
      walletEl.textContent = stats.stats.uniqueWallets;
    }
    const h24El = document.getElementById('last-24h');
    if (h24El && stats?.stats) {
      h24El.textContent = stats.stats.paymentsLast24h;
    }

    const cisaKevEl = document.getElementById('cisa-kev-count');
    if (cisaKevEl && stats?.threatFeeds?.cisaKevCount) {
      cisaKevEl.textContent = `${stats.threatFeeds.cisaKevCount.toLocaleString()}+`;
    }
    const cachedEl = document.getElementById('cached-cves-count');
    if (cachedEl && stats?.threatFeeds) {
      cachedEl.textContent = stats.threatFeeds.cachedExternalCvesCount ?? 0;
    }

    const base = window.location.origin;
    const statsUrlEl = document.getElementById('api-url-stats');
    if (statsUrlEl) statsUrlEl.textContent = `${base}/api/v1/stats`;

    const insightUrlEl = document.getElementById('api-url-insight');
    if (insightUrlEl) insightUrlEl.textContent = `${base}/api/v1/insight`;

    const feedRes = await fetch('/api/v1/stats/feed?limit=20', {
      headers: { 'x-admin-key': token }
    });
    if (feedRes.status === 401) {
      adminLogout();
      return;
    }
    const feedData = await feedRes.json();

    renderFeed(feedData.payments);
  } catch (err) {
    console.error('Failed to fetch telemetry data:', err);
  } finally {
    if (refreshBtn) {
      const icon = refreshBtn.querySelector('iconify-icon');
      if (icon) {
        setTimeout(() => icon.classList.remove('animate-spin'), 600);
      }
    }
  }
}

function renderFeed(payments) {
  const tbody = document.getElementById('feed-body');
  if (!tbody) return;

  if (!payments || payments.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-icon text-[#8b3a2a]">
              <iconify-icon icon="solar:radar-linear" class="text-4xl"></iconify-icon>
            </div>
            <div class="text-[#c8c4bc]/70">No payments recorded yet</div>
            <div class="text-[0.65rem] text-[#c8c4bc]/40 mt-1">Execute autonomous agent queries or test via the interactive playground to inspect live transactions</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const isNew = payments.length > previousPaymentCount;
  previousPaymentCount = payments.length;

  tbody.innerHTML = payments.map((p, i) => {
    const isSettled = p.status === 'SETTLED';
    const statusClass = isSettled ? 'status-settled' : 'status-pending';
    const statusIcon = isSettled ? 'solar:check-circle-linear' : 'solar:clock-circle-linear';
    const statusText = isSettled ? 'SETTLED' : 'PENDING';
    const rowClass = isNew && i === 0 ? 'new-row' : '';

    const amountVal = Number(p.amount);
    const displayAmount = amountVal >= 1000
      ? `${(amountVal / 1e6).toFixed(6)} USDC`
      : `${p.amount} USDC`;

    return `
      <tr class="${rowClass} border-b border-[#c8c4bc]/5 hover:bg-[#c8c4bc]/[0.02] transition-colors">
        <td class="py-3.5 px-5">
          <span class="status-badge ${statusClass}">
            <iconify-icon icon="${statusIcon}" class="text-sm"></iconify-icon>
            ${statusText}
          </span>
        </td>
        <td class="py-3.5 px-5 mono text-[#c8c4bc]" title="${p.from}">
          <span class="bg-[#121316] px-2 py-1 rounded border border-[#c8c4bc]/10">
            ${truncateAddress(p.from)}
          </span>
        </td>
        <td class="py-3.5 px-5 mono font-bold text-white">
          ${displayAmount}
        </td>
        <td class="py-3.5 px-5">
          <code class="text-[0.7rem] text-[#8b3a2a] bg-[#8b3a2a]/10 px-2 py-0.5 rounded border border-[#8b3a2a]/20">
            ${p.endpoint}
          </code>
        </td>
        <td class="py-3.5 px-5">
          ${p.txHash
            ? `<a href="${p.explorerUrl || `https://explorer.arc.io/tx/${p.txHash}`}" target="_blank" rel="noopener" class="mono text-[#c8c4bc]/80 hover:text-white underline flex items-center gap-1" title="${p.txHash}">
                <span>${truncateHash(p.txHash)}</span>
                <iconify-icon icon="solar:arrow-right-up-linear" class="text-xs text-[#8b3a2a]"></iconify-icon>
              </a>`
            : '<span class="font-mono-custom text-[0.65rem] text-[#c8c4bc]/40 italic">Awaiting block confirmation</span>'
          }
        </td>
        <td class="py-3.5 px-5 font-mono-custom text-[0.7rem] text-[#c8c4bc]/50">
          ${formatTime(p.settledAt || p.createdAt)}
        </td>
      </tr>
    `;
  }).join('');
}

function truncateAddress(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function truncateHash(hash) {
  if (!hash) return '—';
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function formatTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString();
  } catch {
    return isoString;
  }
}

if (checkAuthState()) {
  fetchData();
  pollTimer = setInterval(fetchData, POLL_INTERVAL);
} else {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.classList.remove('hidden');
}
