#!/usr/bin/env python3
"""Deploy Quantum BA LMS to Cloudflare Pages"""

import requests
import json

CF_TOKEN = 'cfat_l4CfpJ3k2OBnCYORKK9CUPOKXXxqDmFupMO8FRKAd6c38ee7'
ACCOUNT_ID = '66ad81e734e90f98cc6e179b423daaa4'

headers = {
    'Authorization': f'Bearer {CF_TOKEN}',
    'Content-Type': 'application/json'
}

payload = {
    'name': 'quantum-ba-lms',
    'production_branch': 'main',
    'source': {
        'type': 'github',
        'owner': 'QuantumReti',
        'repo': 'quantum-ba-lms'
    }
}

url = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/pages/projects'

try:
    response = requests.post(url, headers=headers, json=payload)
    result = response.json()
    
    if result.get('success'):
        project = result.get('result', {})
        print('✅ DEPLOYMENT SUCCESSFUL')
        print(f"Project: {project.get('name')}")
        print(f"URL: https://{project.get('subdomain')}.pages.dev")
        print(f"Status: {project.get('status', 'deploying')}")
        print(f"\n🔗 Live at: https://quantum-ba-lms.pages.dev")
    else:
        print('❌ DEPLOYMENT FAILED')
        errors = result.get('errors', [])
        for error in errors:
            print(f"Error: {error.get('message')}")
        print(f"\nFull response: {json.dumps(result, indent=2)}")
        
except Exception as e:
    print(f'❌ Request failed: {e}')
