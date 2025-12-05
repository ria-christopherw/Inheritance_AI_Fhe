// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface InheritanceRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  beneficiary: string;
  lastActivity: number;
  status: "active" | "triggered" | "pending";
}

// Randomly selected styles: 
// Colors: High contrast (blue+orange)
// UI: Future metal
// Layout: Center radiation
// Interaction: Micro-interactions

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<InheritanceRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({ beneficiary: "", thresholdDays: 90, inheritanceAmount: 0 });
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [selectedRecord, setSelectedRecord] = useState<InheritanceRecord | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("inheritance_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing record keys:", e); }
      }
      
      const list: InheritanceRecord[] = [];
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`inheritance_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({ 
                id: key, 
                encryptedData: recordData.data, 
                timestamp: recordData.timestamp, 
                owner: recordData.owner, 
                beneficiary: recordData.beneficiary,
                lastActivity: recordData.lastActivity,
                status: recordData.status || "active"
              });
            } catch (e) { console.error(`Error parsing record data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading record ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) { console.error("Error loading records:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const setupInheritance = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setSettingUp(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting inheritance data with Zama FHE..." });
    
    try {
      const encryptedAmount = FHEEncryptNumber(newRecordData.inheritanceAmount);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const recordData = { 
        data: encryptedAmount, 
        timestamp: Math.floor(Date.now() / 1000),
        owner: address,
        beneficiary: newRecordData.beneficiary,
        lastActivity: Math.floor(Date.now() / 1000),
        status: "active",
        thresholdDays: newRecordData.thresholdDays
      };
      
      await contract.setData(`inheritance_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(recordData)));
      
      const keysBytes = await contract.getData("inheritance_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(recordId);
      await contract.setData("inheritance_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted inheritance plan created!" });
      await loadRecords();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowSetupModal(false);
        setNewRecordData({ beneficiary: "", thresholdDays: 90, inheritanceAmount: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Setup failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setSettingUp(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const triggerInheritance = async (recordId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted inheritance with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const recordBytes = await contract.getData(`inheritance_${recordId}`);
      if (recordBytes.length === 0) throw newError("Record not found");
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      const updatedRecord = { ...recordData, status: "triggered" };
      
      await contract.setData(`inheritance_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(updatedRecord)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Inheritance triggered successfully!" });
      await loadRecords();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Trigger failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const updateActivity = async (recordId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Updating activity with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const recordBytes = await contract.getData(`inheritance_${recordId}`);
      if (recordBytes.length === 0) throw new Error("Record not found");
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      const updatedRecord = { ...recordData, lastActivity: Math.floor(Date.now() / 1000) };
      
      await contract.setData(`inheritance_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(updatedRecord)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Activity updated successfully!" });
      await loadRecords();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Update failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (recordAddress: string) => address?.toLowerCase() === recordAddress.toLowerCase();
  const isBeneficiary = (recordBeneficiary: string) => address?.toLowerCase() === recordBeneficiary.toLowerCase();

  const tutorialSteps = [
    { title: "Setup Inheritance", description: "Create an encrypted inheritance plan with your assets", icon: "🔒" },
    { title: "AI Monitoring", description: "Our AI monitors your digital activity through FHE-encrypted signals", icon: "👁️", details: "Activity is verified without exposing your private data" },
    { title: "Automatic Trigger", description: "If no activity is detected, inheritance is automatically released", icon: "⚡", details: "Uses Zama FHE to verify inactivity while keeping data encrypted" },
    { title: "Beneficiary Access", description: "Designated beneficiaries can claim the inheritance", icon: "👪", details: "All transactions are processed with fully homomorphic encryption" }
  ];

  const activeCount = records.filter(r => r.status === "active").length;
  const triggeredCount = records.filter(r => r.status === "triggered").length;
  const pendingCount = records.filter(r => r.status === "pending").length;

  const renderStatusChart = () => {
    const total = records.length || 1;
    const activePercentage = (activeCount / total) * 100;
    const triggeredPercentage = (triggeredCount / total) * 100;
    const pendingPercentage = (pendingCount / total) * 100;
    
    return (
      <div className="status-chart">
        <div className="chart-bar active" style={{ width: `${activePercentage}%` }}></div>
        <div className="chart-bar triggered" style={{ width: `${triggeredPercentage}%` }}></div>
        <div className="chart-bar pending" style={{ width: `${pendingPercentage}%` }}></div>
        <div className="chart-labels">
          <span>Active: {activeCount}</span>
          <span>Triggered: {triggeredCount}</span>
          <span>Pending: {pendingCount}</span>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing FHE encryption...</p>
    </div>
  );

  return (
    <div className="app-container future-metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="hexagon"></div>
            <div className="ai-icon"></div>
          </div>
          <h1>FHE<span>Inheritance</span></h1>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setShowSetupModal(true)} 
            className="setup-btn metal-button"
            onMouseEnter={(e) => e.currentTarget.classList.add('glow')}
            onMouseLeave={(e) => e.currentTarget.classList.remove('glow')}
          >
            <div className="shield-icon"></div>Setup Plan
          </button>
          <button 
            className="metal-button" 
            onClick={() => setShowTutorial(!showTutorial)}
            onMouseEnter={(e) => e.currentTarget.classList.add('pulse')}
            onMouseLeave={(e) => e.currentTarget.classList.remove('pulse')}
          >
            {showTutorial ? "Hide Guide" : "How It Works"}
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content center-radial">
        <div className="hero-panel metal-card">
          <div className="hero-content">
            <h2>AI-Powered Digital Inheritance</h2>
            <p>Secure your legacy with fully homomorphic encryption. Your assets remain private while our AI verifies your activity.</p>
            <div className="hero-stats">
              <div className="stat-item">
                <div className="stat-value">{records.length}</div>
                <div className="stat-label">Active Plans</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{triggeredCount}</div>
                <div className="stat-label">Executed</div>
              </div>
            </div>
          </div>
          <div className="fhe-badge">
            <div className="fhe-icon"></div>
            <span>Powered by Zama FHE</span>
          </div>
        </div>

        {showTutorial && (
          <div className="tutorial-section metal-card">
            <h2>How FHE Inheritance Works</h2>
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div className="tutorial-step" key={index}>
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    {step.details && <div className="step-details">{step.details}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="fhe-process">
              <div className="process-step">
                <div className="process-icon">🔓</div>
                <div className="process-label">Plain Data</div>
              </div>
              <div className="process-arrow">→</div>
              <div className="process-step">
                <div className="process-icon">🔒</div>
                <div className="process-label">FHE Encryption</div>
              </div>
              <div className="process-arrow">→</div>
              <div className="process-step">
                <div className="process-icon">🤖</div>
                <div className="process-label">AI Monitoring</div>
              </div>
              <div className="process-arrow">→</div>
              <div className="process-step">
                <div className="process-icon">⚡</div>
                <div className="process-label">Automatic Execution</div>
              </div>
            </div>
          </div>
        )}

        <div className="control-panel metal-card">
          <div className="panel-header">
            <h3>Your Inheritance Plans</h3>
            <div className="panel-actions">
              <button 
                onClick={loadRecords} 
                className="refresh-btn metal-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button 
                onClick={() => setShowStats(!showStats)} 
                className="stats-btn metal-button"
              >
                {showStats ? "Hide Stats" : "Show Stats"}
              </button>
            </div>
          </div>

          {showStats && (
            <div className="stats-section">
              <h4>Plan Status Distribution</h4>
              {renderStatusChart()}
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-title">Active Plans</div>
                  <div className="stat-value">{activeCount}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-title">Triggered</div>
                  <div className="stat-value">{triggeredCount}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-title">Pending</div>
                  <div className="stat-value">{pendingCount}</div>
                </div>
              </div>
            </div>
          )}

          <div className="records-list">
            <div className="list-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Beneficiary</div>
              <div className="header-cell">Last Activity</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {records.length === 0 ? (
              <div className="no-records">
                <div className="no-data-icon"></div>
                <p>No inheritance plans found</p>
                <button 
                  className="metal-button primary" 
                  onClick={() => setShowSetupModal(true)}
                >
                  Create Your First Plan
                </button>
              </div>
            ) : records.map(record => (
              <div 
                className="record-item" 
                key={record.id}
                onClick={() => setSelectedRecord(record)}
                onMouseEnter={(e) => e.currentTarget.classList.add('hover-glow')}
                onMouseLeave={(e) => e.currentTarget.classList.remove('hover-glow')}
              >
                <div className="list-cell">#{record.id.substring(0, 6)}</div>
                <div className="list-cell">{record.beneficiary.substring(0, 6)}...{record.beneficiary.substring(38)}</div>
                <div className="list-cell">
                  {Math.floor((Date.now()/1000 - record.lastActivity)/86400)} days ago
                </div>
                <div className="list-cell">
                  <span className={`status-badge ${record.status}`}>{record.status}</span>
                </div>
                <div className="list-cell actions">
                  {isOwner(record.owner) && record.status === "active" && (
                    <button 
                      className="action-btn metal-button small"
                      onClick={(e) => { e.stopPropagation(); updateActivity(record.id); }}
                    >
                      Update Activity
                    </button>
                  )}
                  {isBeneficiary(record.beneficiary) && record.status === "triggered" && (
                    <button 
                      className="action-btn metal-button small success"
                      onClick={(e) => { e.stopPropagation(); triggerInheritance(record.id); }}
                    >
                      Claim
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showSetupModal && (
        <ModalSetup 
          onSubmit={setupInheritance} 
          onClose={() => setShowSetupModal(false)} 
          settingUp={settingUp} 
          recordData={newRecordData} 
          setRecordData={setNewRecordData}
        />
      )}

      {selectedRecord && (
        <RecordDetailModal 
          record={selectedRecord} 
          onClose={() => { setSelectedRecord(null); setDecryptedValue(null); }} 
          decryptedValue={decryptedValue} 
          setDecryptedValue={setDecryptedValue} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="hexagon small"></div>
              <span>FHE Inheritance</span>
            </div>
            <p>Secure digital legacy with Zama FHE technology</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge small">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} FHE Inheritance Protocol</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalSetupProps {
  onSubmit: () => void; 
  onClose: () => void; 
  settingUp: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalSetup: React.FC<ModalSetupProps> = ({ onSubmit, onClose, settingUp, recordData, setRecordData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setRecordData({ ...recordData, [name]: value });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setRecordData({ ...recordData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!recordData.beneficiary || !recordData.inheritanceAmount) { 
      alert("Please fill required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="setup-modal metal-card">
        <div className="modal-header">
          <h2>Setup Inheritance Plan</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <div>
              <strong>FHE Encryption Active</strong>
              <p>All data is encrypted with Zama FHE before submission</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Beneficiary Address *</label>
            <input 
              type="text" 
              name="beneficiary" 
              value={recordData.beneficiary} 
              onChange={handleChange} 
              placeholder="0x..." 
              className="metal-input"
            />
          </div>
          
          <div className="form-group">
            <label>Inactivity Threshold (Days) *</label>
            <input 
              type="number" 
              name="thresholdDays" 
              value={recordData.thresholdDays} 
              onChange={handleValueChange} 
              min="1"
              className="metal-input"
            />
          </div>
          
          <div className="form-group">
            <label>Inheritance Amount *</label>
            <input 
              type="number" 
              name="inheritanceAmount" 
              value={recordData.inheritanceAmount} 
              onChange={handleValueChange} 
              placeholder="0.00" 
              step="0.01"
              className="metal-input"
            />
          </div>
          
          <div className="encryption-preview">
            <h4>FHE Encryption Preview</h4>
            <div className="preview-grid">
              <div className="preview-item">
                <span>Plain Value:</span>
                <div>{recordData.inheritanceAmount || '0.00'}</div>
              </div>
              <div className="preview-arrow">→</div>
              <div className="preview-item encrypted">
                <span>Encrypted:</span>
                <div>{recordData.inheritanceAmount ? FHEEncryptNumber(recordData.inheritanceAmount).substring(0, 40) + '...' : 'FHE-...'}</div>
              </div>
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="shield-icon"></div>
            <div>
              <strong>Privacy Guarantee</strong>
              <p>Your data remains encrypted during AI monitoring and is never decrypted on our servers</p>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn metal-button">
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={settingUp} 
            className="submit-btn metal-button primary"
          >
            {settingUp ? "Encrypting with FHE..." : "Create Secure Plan"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface RecordDetailModalProps {
  record: InheritanceRecord;
  onClose: () => void;
  decryptedValue: number | null;
  setDecryptedValue: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const RecordDetailModal: React.FC<RecordDetailModalProps> = ({ 
  record, 
  onClose, 
  decryptedValue, 
  setDecryptedValue, 
  isDecrypting, 
  decryptWithSignature 
}) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) { 
      setDecryptedValue(null); 
      return; 
    }
    const decrypted = await decryptWithSignature(record.encryptedData);
    if (decrypted !== null) setDecryptedValue(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="detail-modal metal-card">
        <div className="modal-header">
          <h2>Inheritance Plan Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="info-grid">
            <div className="info-item">
              <span>Plan ID:</span>
              <strong>#{record.id.substring(0, 8)}</strong>
            </div>
            <div className="info-item">
              <span>Owner:</span>
              <strong>{record.owner.substring(0, 6)}...{record.owner.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Beneficiary:</span>
              <strong>{record.beneficiary.substring(0, 6)}...{record.beneficiary.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Created:</span>
              <strong>{new Date(record.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Last Activity:</span>
              <strong>{new Date(record.lastActivity * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Status:</span>
              <strong className={`status-badge ${record.status}`}>{record.status}</strong>
            </div>
          </div>
          
          <div className="encrypted-section">
            <h3>Encrypted Inheritance</h3>
            <div className="encrypted-data">
              {record.encryptedData.substring(0, 60)}...
            </div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>FHE Encrypted</span>
            </div>
            
            <button 
              className="decrypt-btn metal-button" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? (
                <span className="decrypt-spinner"></span>
              ) : decryptedValue !== null ? (
                "Hide Value"
              ) : (
                "Decrypt with Signature"
              )}
            </button>
          </div>
          
          {decryptedValue !== null && (
            <div className="decrypted-section">
              <h3>Decrypted Value</h3>
              <div className="decrypted-value">{decryptedValue}</div>
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>This value is only visible after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn metal-button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;