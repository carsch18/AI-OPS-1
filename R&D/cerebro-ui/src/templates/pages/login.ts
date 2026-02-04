/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Login Page
   Standalone login page with authentication form
   ═══════════════════════════════════════════════════════════════════════════════ */

import { generateCSS } from '../../styles';
import { config } from '../../config';

export function loginPage(): string {
  const css = generateCSS();
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - ${config.appName}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧠</text></svg>">
  <style>${css}</style>
  <style>
    .login-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-primary);
      padding: var(--space-4);
    }
    
    .login-card {
      width: 100%;
      max-width: 400px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      padding: var(--space-8);
      box-shadow: var(--shadow-xl), var(--shadow-glow);
    }
    
    .login-logo {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: var(--space-8);
    }
    
    .login-logo-icon {
      width: 64px;
      height: 64px;
      background: linear-gradient(135deg, var(--accent-primary), var(--pink-600));
      border-radius: var(--radius-xl);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      box-shadow: var(--shadow-glow-strong);
      margin-bottom: var(--space-4);
    }
    
    .login-logo-text {
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
      letter-spacing: var(--tracking-wide);
      background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .login-tagline {
      font-size: var(--text-sm);
      color: var(--text-tertiary);
      margin-top: var(--space-1);
    }
    
    .login-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    
    .login-error {
      padding: var(--space-3);
      background: var(--color-error-bg);
      border: 1px solid var(--color-error);
      border-radius: var(--radius-md);
      color: var(--color-error);
      font-size: var(--text-sm);
      display: none;
    }
    
    .login-error.visible {
      display: block;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-card">
      <div class="login-logo">
        <div class="login-logo-icon">🧠</div>
        <div class="login-logo-text">CEREBRO</div>
        <div class="login-tagline">${config.appTagline}</div>
      </div>
      
      <form class="login-form" id="login-form">
        <div id="login-error" class="login-error"></div>
        
        <div class="input-group">
          <label for="email">Email</label>
          <input 
            type="email" 
            id="email" 
            class="input" 
            placeholder="admin@aiops.local"
            value="admin@aiops.local"
            required
          >
        </div>
        
        <div class="input-group">
          <label for="password">Password</label>
          <input 
            type="password" 
            id="password" 
            class="input" 
            placeholder="Enter your password"
            value="admin123"
            required
          >
        </div>
        
        <button type="submit" class="btn btn-primary" style="width: 100%; height: 44px; font-size: var(--text-base);">
          Sign In
        </button>
        
        <div style="text-align: center; font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--space-2);">
          Default credentials: admin@aiops.local / admin123
        </div>
      </form>
    </div>
  </div>
  
  <script>
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const errorEl = document.getElementById('login-error');
      
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        if (!response.ok) {
          throw new Error('Invalid credentials');
        }
        
        const data = await response.json();
        localStorage.setItem('token', data.access_token);
        window.location.href = '/';
      } catch (err) {
        errorEl.textContent = err.message || 'Login failed';
        errorEl.classList.add('visible');
      }
    });
  </script>
</body>
</html>`;
}
