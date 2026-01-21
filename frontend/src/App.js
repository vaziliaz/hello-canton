import React, { useState, useEffect } from 'react';
import './App.css';
import damlApi from './services/damlApi';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [simpleTokens, setSimpleTokens] = useState([]);
  const [escrows, setEscrows] = useState([]);
  const [collateralLocks, setCollateralLocks] = useState([]);

  useEffect(() => {
    // Check if user is already logged in
    if (damlApi.isAuthenticated()) {
      setUser(damlApi.getUserId());
      fetchAllContracts();
    }
  }, []);

  const login = async (userId) => {
    setLoading(true);
    setError(null);
    try {
      await damlApi.login(userId);
      setUser(userId);
      await fetchAllContracts();
    } catch (err) {
      setError(err.message);
      console.error('Login failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    damlApi.logout();
    setUser(null);
    setSimpleTokens([]);
    setEscrows([]);
    setCollateralLocks([]);
    setError(null);
  };

  const fetchAllContracts = async () => {
    if (!damlApi.isAuthenticated()) return;

    setLoading(true);
    setError(null);
    try {
      // Fetch all three contract types
      const [tokensResult, escrowsResult, locksResult] = await Promise.all([
        damlApi.queryContracts(['SimpleToken:SimpleToken']).catch(() => ({ result: [] })),
        damlApi.queryContracts(['Escrow:Escrow']).catch(() => ({ result: [] })),
        damlApi.queryContracts(['CollateralLock:CollateralLock']).catch(() => ({ result: [] })),
      ]);

      setSimpleTokens(tokensResult.result || []);
      setEscrows(escrowsResult.result || []);
      setCollateralLocks(locksResult.result || []);
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch contracts:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="App">
        <div className="login-container">
          <h1>DAML Application</h1>
          <p className="subtitle">Connect to your DAML ledger</p>
          {error && <div className="error-message">{error}</div>}
          <div className="login-buttons">
            <button 
              onClick={() => login('alice')} 
              disabled={loading}
              className="login-button"
            >
              {loading ? 'Connecting...' : 'Login as Alice'}
            </button>
            <button 
              onClick={() => login('bob')} 
              disabled={loading}
              className="login-button"
            >
              {loading ? 'Connecting...' : 'Login as Bob'}
            </button>
          </div>
          {error && (
            <div className="error-help">
              <p>Make sure:</p>
              <ul>
                <li>DAML JSON API is running on port 7575</li>
                <li>Users 'alice' and 'bob' are created in the ledger</li>
                <li>CORS is enabled for localhost:3000</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <h1>DAML Application Dashboard</h1>
          <div className="user-info">
            <span className="user-badge">Logged in as: <strong>{user}</strong></span>
            <button onClick={logout} className="logout-button">Logout</button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {error && <div className="error-banner">{error}</div>}
        
        <div className="controls">
          <button 
            onClick={fetchAllContracts} 
            disabled={loading}
            className="refresh-button"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh Contracts'}
          </button>
        </div>

        <div className="contracts-grid">
          <ContractSection
            title="Simple Tokens"
            contracts={simpleTokens}
            renderContract={(contract) => (
              <div className="contract-card">
                <div className="contract-field">
                  <span className="field-label">Contract ID:</span>
                  <span className="field-value contract-id">{contract.contractId}</span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Issuer:</span>
                  <span className="field-value">{contract.payload?.issuer || 'N/A'}</span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Owner:</span>
                  <span className="field-value">{contract.payload?.owner || 'N/A'}</span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Amount:</span>
                  <span className="field-value amount">{contract.payload?.amount || 'N/A'}</span>
                </div>
              </div>
            )}
            emptyMessage="No SimpleToken contracts found"
          />

          <ContractSection
            title="Escrow Contracts"
            contracts={escrows}
            renderContract={(contract) => (
              <div className="contract-card">
                <div className="contract-field">
                  <span className="field-label">Contract ID:</span>
                  <span className="field-value contract-id">{contract.contractId}</span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Sender:</span>
                  <span className="field-value">{contract.payload?.sender || 'N/A'}</span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Receiver:</span>
                  <span className="field-value">{contract.payload?.receiver || 'N/A'}</span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Amount:</span>
                  <span className="field-value amount">{contract.payload?.amount || 'N/A'}</span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Status:</span>
                  <span className={`field-value status ${contract.payload?.isApproved ? 'approved' : 'pending'}`}>
                    {contract.payload?.isApproved ? '✓ Approved' : '⏳ Pending'}
                  </span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Note:</span>
                  <span className="field-value">{contract.payload?.note || 'N/A'}</span>
                </div>
              </div>
            )}
            emptyMessage="No Escrow contracts found"
          />

          <ContractSection
            title="Collateral Locks"
            contracts={collateralLocks}
            renderContract={(contract) => (
              <div className="contract-card">
                <div className="contract-field">
                  <span className="field-label">Contract ID:</span>
                  <span className="field-value contract-id">{contract.contractId}</span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Owner:</span>
                  <span className="field-value">{contract.payload?.owner || 'N/A'}</span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Custodian:</span>
                  <span className="field-value">{contract.payload?.custodian || 'N/A'}</span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Asset:</span>
                  <span className="field-value">{contract.payload?.asset || 'N/A'}</span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Amount:</span>
                  <span className="field-value amount">{contract.payload?.amount || 'N/A'}</span>
                </div>
                <div className="contract-field">
                  <span className="field-label">Min Collateral:</span>
                  <span className="field-value">{contract.payload?.minCollateralAmount || 'N/A'}</span>
                </div>
              </div>
            )}
            emptyMessage="No CollateralLock contracts found"
          />
        </div>
      </main>
    </div>
  );
}

function ContractSection({ title, contracts, renderContract, emptyMessage }) {
  return (
    <section className="contract-section">
      <h2 className="section-title">
        {title} <span className="count-badge">({contracts.length})</span>
      </h2>
      {contracts.length === 0 ? (
        <div className="empty-state">{emptyMessage}</div>
      ) : (
        <div className="contracts-list">
          {contracts.map((contract, i) => (
            <div key={contract.contractId || i}>
              {renderContract(contract)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default App;
