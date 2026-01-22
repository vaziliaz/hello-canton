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
  const [showCreateToken, setShowCreateToken] = useState(false);
  const [createTokenForm, setCreateTokenForm] = useState({
    owner: '',
    amount: ''
  });

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
      // Query all contracts - the queryContracts method will handle finding package ID
      // and constructing proper template IDs, or query all and filter
      const allContractsResult = await damlApi.queryContracts([]).catch(() => ({ result: [] }));
      const allContracts = allContractsResult.result || [];

      // Filter contracts by template name (works for both specific queries and all-contracts fallback)
      const tokensResult = { 
        result: allContracts.filter(c => {
          const templateId = c.templateId || '';
          return templateId.includes('SimpleToken:SimpleToken') || templateId.endsWith(':SimpleToken:SimpleToken');
        })
      };
      
      const escrowsResult = { 
        result: allContracts.filter(c => {
          const templateId = c.templateId || '';
          return templateId.includes('Escrow:Escrow') || templateId.endsWith(':Escrow:Escrow');
        })
      };
      
      const locksResult = { 
        result: allContracts.filter(c => {
          const templateId = c.templateId || '';
          return templateId.includes('CollateralLock:CollateralLock') || templateId.endsWith(':CollateralLock:CollateralLock');
        })
      };

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
          <button 
            onClick={() => {
              localStorage.removeItem('daml_package_id');
              fetchAllContracts();
            }}
            className="clear-cache-button"
            title="Clear package ID cache and refresh"
          >
            🔄 Clear Cache
          </button>
          <button 
            onClick={() => setShowCreateToken(!showCreateToken)}
            className="create-button"
          >
            {showCreateToken ? '✕ Cancel' : '➕ Create Token'}
          </button>
        </div>

        {showCreateToken && (
          <CreateTokenForm
            user={user}
            partyIdentifier={damlApi.getPartyIdentifier()}
            onSubmit={async (formData) => {
              setLoading(true);
              setError(null);
              try {
                await damlApi.createSimpleToken(
                  formData.issuer,
                  formData.owner,
                  formData.amount
                );
                setShowCreateToken(false);
                setCreateTokenForm({ owner: '', amount: '' });
                await fetchAllContracts();
              } catch (err) {
                let errorMsg = err.message;
                // Provide more helpful error message
                if (errorMsg.includes('Could not find the correct package ID') || 
                    errorMsg.includes('DAR file is not uploaded')) {
                  errorMsg += ' Try running `daml start` in your terminal to upload the DAR file.';
                }
                setError(errorMsg);
                console.error('Failed to create token:', err);
              } finally {
                setLoading(false);
              }
            }}
            onCancel={() => {
              setShowCreateToken(false);
              setCreateTokenForm({ owner: '', amount: '' });
            }}
          />
        )}

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

function CreateTokenForm({ user, partyIdentifier, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    owner: '',
    amount: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [parties, setParties] = useState([]);
  const [loadingParties, setLoadingParties] = useState(true);

  useEffect(() => {
    // Fetch available parties for the dropdown
    const fetchParties = async () => {
      try {
        const response = await fetch('/v1/parties', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('daml_token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setParties(data.result || []);
        }
      } catch (err) {
        console.error('Failed to fetch parties:', err);
      } finally {
        setLoadingParties(false);
      }
    };
    fetchParties();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.owner || !formData.amount) {
      alert('Please fill in all fields');
      return;
    }

    setSubmitting(true);
    try {
      // Use current user's party identifier as issuer
      await onSubmit({
        issuer: partyIdentifier,
        owner: formData.owner,
        amount: parseFloat(formData.amount)
      });
    } catch (err) {
      console.error('Create token error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="create-token-form">
      <h3>Create Simple Token</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label>
            Issuer (You): <span className="field-hint">{partyIdentifier || 'Loading...'}</span>
          </label>
        </div>
        <div className="form-field">
          <label>
            Owner Party: *
            {loadingParties ? (
              <input
                type="text"
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                placeholder="Loading parties..."
                disabled
              />
            ) : (
              <select
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                required
              >
                <option value="">Select a party...</option>
                {parties.map((party) => (
                  <option key={party.identifier} value={party.identifier}>
                    {party.displayName || party.identifier}
                  </option>
                ))}
              </select>
            )}
          </label>
          <small className="form-hint">Select the party who will own the token</small>
        </div>
        <div className="form-field">
          <label>
            Amount: *
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="100.00"
              required
            />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" disabled={submitting} className="submit-button">
            {submitting ? 'Creating...' : 'Create Token'}
          </button>
          <button type="button" onClick={onCancel} className="cancel-button">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default App;
