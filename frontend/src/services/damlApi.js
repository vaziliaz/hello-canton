const API_BASE_URL = 'http://localhost:7575/v1';

class DamlApi {
  constructor() {
    this.token = localStorage.getItem('daml_token');
    this.userId = localStorage.getItem('daml_user_id');
  }

  async login(userId) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Login failed: ${error}`);
      }

      const data = await response.json();
      this.token = data.token;
      this.userId = userId;
      
      localStorage.setItem('daml_token', this.token);
      localStorage.setItem('daml_user_id', this.userId);
      
      return this.token;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  logout() {
    this.token = null;
    this.userId = null;
    localStorage.removeItem('daml_token');
    localStorage.removeItem('daml_user_id');
  }

  async queryContracts(templateIds) {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify({ templateIds }),
    });

    if (!response.ok) {
      const error = await response.text();
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
}

export default new DamlApi();
