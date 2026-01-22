// Use relative URL when proxy is configured, or absolute URL for direct connection
const API_BASE_URL = process.env.REACT_APP_API_URL || '/v1';

// Simple JWT token generator for --allow-insecure-tokens mode
// Creates a minimal JWT with userId, ledgerId, applicationId, and party identifiers
async function createSimpleJWT(userId, partyIdentifier) {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=/g, '');
  const payload = btoa(JSON.stringify({ 
    userId, 
    ledgerId: 'sandbox',
    applicationId: 'ex-seeding-script',
    actAs: [partyIdentifier],
    readAs: [partyIdentifier],
    exp: Math.floor(Date.now() / 1000) + 86400 
  })).replace(/=/g, '');
  // For --allow-insecure-tokens, we can use an empty signature
  return `${header}.${payload}.`;
}

class DamlApi {
  constructor() {
    this.token = localStorage.getItem('daml_token');
    this.userId = localStorage.getItem('daml_user_id');
    this.partyIdentifier = localStorage.getItem('daml_party_identifier');
  }

  async login(userId) {
    try {
      // First, get the party identifier for this userId
      // Try with a simple token first to get party info
      const partiesResponse = await fetch(`${API_BASE_URL}/parties`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${userId}`,
        },
      });

      if (!partiesResponse.ok) {
        throw new Error('Failed to fetch parties. Make sure the JSON API is running.');
      }

      const partiesData = await partiesResponse.json();
      const parties = partiesData.result || [];
      
      // Find the party that matches the userId (case-insensitive match on displayName)
      const userParty = parties.find(p => 
        p.displayName?.toLowerCase() === userId.toLowerCase() || 
        p.identifier?.toLowerCase().startsWith(userId.toLowerCase())
      );

      if (!userParty) {
        throw new Error(`Party not found for userId: ${userId}`);
      }

      // Generate JWT token with the party identifier
      const token = await createSimpleJWT(userId, userParty.identifier);
      
      // Test the connection with the JWT token
      const testResponse = await fetch(`${API_BASE_URL}/parties`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!testResponse.ok) {
        const error = await testResponse.text();
        throw new Error(`Authentication failed: ${error}`);
      }

      // Store the token, userId, and party identifier
      this.token = token;
      this.userId = userId;
      this.partyIdentifier = userParty.identifier;
      
      localStorage.setItem('daml_token', this.token);
      localStorage.setItem('daml_user_id', this.userId);
      localStorage.setItem('daml_party_identifier', this.partyIdentifier);
      
      return this.token;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  logout() {
    this.token = null;
    this.userId = null;
    this.partyIdentifier = null;
    localStorage.removeItem('daml_token');
    localStorage.removeItem('daml_user_id');
    localStorage.removeItem('daml_party_identifier');
  }

  async getPackages() {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/packages`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch packages: ${error}`);
    }

    return response.json();
  }

  async findPackageId() {
    // Cache package ID to avoid repeated lookups
    // But clear it if we're having issues (user can clear via button)
    const cached = localStorage.getItem('daml_package_id');
    if (cached) {
      return cached;
    }

    try {
      // First, try to extract package ID from existing contracts
      // Query all contracts and see what package IDs are used
      const allContractsResponse = await fetch(`${API_BASE_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({ templateIds: [] }),
      });

      if (allContractsResponse.ok) {
        const allContracts = await allContractsResponse.json();
        const contracts = allContracts.result || [];
        
        // Extract package ID from existing contracts
        for (const contract of contracts) {
          if (contract.templateId) {
            const parts = contract.templateId.split(':');
            if (parts.length === 3 && parts[1] === 'SimpleToken') {
              const packageId = parts[0];
              localStorage.setItem('daml_package_id', packageId);
              return packageId;
            }
          }
        }
      }

      // If no existing contracts, try each package ID by attempting to create
      // We'll test by trying to create with each package ID
      const packagesData = await this.getPackages();
      const packageIds = packagesData.result || [];
      
      // Try each package ID - test by checking if template exists
      // We can't easily test creation, so we'll try a different approach:
      // Try querying with each package ID and see which one doesn't error
      for (const packageId of packageIds) {
        try {
          const testResponse = await fetch(`${API_BASE_URL}/query`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.token}`,
            },
            body: JSON.stringify({ 
              templateIds: [`${packageId}:SimpleToken:SimpleToken`] 
            }),
          });

          const responseText = await testResponse.text();
          
          // Check if it's a valid response (not a template resolution error)
          if (testResponse.ok || (!responseText.includes('Cannot resolve') && !responseText.includes('unknownTemplateIds'))) {
            // This might be the right package, cache it
            localStorage.setItem('daml_package_id', packageId);
            return packageId;
          }
        } catch (err) {
          // Continue to next package
          continue;
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to find package ID:', error);
      return null;
    }
  }

  async queryContracts(templateIds) {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    let finalTemplateIds = templateIds;
    
    // If no templateIds provided, try to find package ID and construct template IDs
    if (!templateIds || templateIds.length === 0) {
      const packageId = await this.findPackageId();
      
      if (packageId) {
        // Construct proper template IDs with the found package ID
        finalTemplateIds = [
          `${packageId}:SimpleToken:SimpleToken`,
          `${packageId}:Escrow:Escrow`,
          `${packageId}:CollateralLock:CollateralLock`
        ];
      } else {
        // Fallback: try to query all contracts and filter client-side
        // Query with empty templateIds might return all contracts (if API supports it)
        console.warn('Could not determine package ID, trying alternative query method');
        finalTemplateIds = [];
      }
    }

    const response = await fetch(`${API_BASE_URL}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify({ templateIds: finalTemplateIds }),
    });

    if (!response.ok) {
      const error = await response.text();
      
      // If template ID format is wrong or package not found, try querying all contracts
      if (error.includes('templateIds') || error.includes('Package ID') || error.includes('Cannot resolve')) {
        // Try querying all active contracts (if API supports empty templateIds)
        // This is a workaround - filter client-side
        console.warn('Template query failed, attempting to query all contracts:', error);
        
        // Try with just module:entity format (some APIs support this)
        const fallbackResponse = await fetch(`${API_BASE_URL}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
          },
          body: JSON.stringify({ templateIds: [] }),
        });

        if (fallbackResponse.ok) {
          const allContracts = await fallbackResponse.json();
          // Filter by template name in templateId field
          return {
            result: (allContracts.result || []).filter(c => {
              const templateId = c.templateId || '';
              return templateId.includes('SimpleToken') || 
                     templateId.includes('Escrow') || 
                     templateId.includes('CollateralLock');
            })
          };
        }
        
        // If all else fails, return empty
        console.warn('All query methods failed, returning empty results');
        return { result: [] };
      }
      throw new Error(`Query failed: ${error}`);
    }

    return response.json();
  }

  async createContract(templateId, payload) {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        templateId,
        payload,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Create failed: ${error}`);
    }

    return response.json();
  }

  async createSimpleToken(issuer, owner, amount) {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    // Get package ID to construct proper template ID
    let packageId = await this.findPackageId();
    
    // If we have a cached package ID, test it first
    if (packageId) {
      try {
        const templateId = `${packageId}:SimpleToken:SimpleToken`;
        const result = await this.createContract(templateId, {
          issuer,
          owner,
          amount: amount.toString(),
        });
        return result;
      } catch (err) {
        const errorMsg = err.message || '';
        // If cached package ID is wrong, clear it and try discovery
        if (errorMsg.includes('Cannot resolve') || errorMsg.includes('unknownTemplateIds')) {
          console.warn('Cached package ID is incorrect, clearing cache and trying all packages...');
          localStorage.removeItem('daml_package_id');
          packageId = null; // Force discovery
        } else {
          throw err;
        }
      }
    }
    
    // If we don't have a package ID or cached one failed, try all packages
    if (!packageId) {
      const packagesData = await this.getPackages();
      const packageIds = packagesData.result || [];
      
      console.log(`Trying ${packageIds.length} packages to find SimpleToken template...`);
      
      // Try ALL packages systematically
      // Start from the end (newest) since DAR was just uploaded
      for (let i = packageIds.length - 1; i >= 0; i--) {
        const pkgId = packageIds[i];
        try {
          const templateId = `${pkgId}:SimpleToken:SimpleToken`;
          const result = await this.createContract(templateId, {
            issuer,
            owner,
            amount: amount.toString(),
          });
          
          // Success! Cache this package ID
          localStorage.setItem('daml_package_id', pkgId);
          console.log(`✓ Found correct package ID: ${pkgId.substring(0, 16)}...`);
          return result;
        } catch (err) {
          const errorMsg = err.message || '';
          // If it's a template resolution error, try next package
          if (errorMsg.includes('Cannot resolve') || errorMsg.includes('unknownTemplateIds')) {
            // Continue to next package
            continue;
          }
          // If it's a different error (like authorization or validation), throw it
          throw err;
        }
      }
      
      // If we tried all packages and none worked
      throw new Error(
        `Tried all ${packageIds.length} packages but none contained SimpleToken template. ` +
        'The DAR file might not be uploaded correctly. ' +
        'Try running: daml ledger upload-dar --host localhost --port 6865 .daml/dist/hello-canton-0.0.1.dar'
      );
    }
  }

  async exerciseChoice(contractId, choice, argument) {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/exercise`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        contractId,
        choice,
        argument,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Exercise failed: ${error}`);
    }

    return response.json();
  }

  isAuthenticated() {
    return !!this.token;
  }

  getUserId() {
    return this.userId;
  }

  getPartyIdentifier() {
    return this.partyIdentifier;
  }
}

export default new DamlApi();
