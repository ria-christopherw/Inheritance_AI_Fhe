pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract InheritanceAiFhe is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    mapping(uint256 => bool) public batchClosed;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    // Encrypted state
    euint32 public encryptedLastSignalTimestamp;
    euint32 public encryptedInactivityThreshold;

    // Events
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PauseToggled(bool indexed paused);
    event CooldownSecondsUpdated(uint256 indexed oldCooldown, uint256 indexed newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event SignalSubmitted(address indexed provider, uint256 indexed batchId);
    event ThresholdSet(uint256 indexed batchId, uint256 encryptedThreshold);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 batchId, uint256 lastSignal, uint256 threshold, bool triggerInheritance);

    // Custom Errors
    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosedOrInvalid();
    error InvalidThreshold();
    error ReplayDetected();
    error StateMismatch();
    error DecryptionFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        emit ProviderAdded(owner);
        currentBatchId = 1; // Start with batch 1
        emit BatchOpened(currentBatchId);
        cooldownSeconds = 60; // Default 1 minute cooldown
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }

    function setCooldownSeconds(uint256 newCooldown) external onlyOwner {
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldown;
        emit CooldownSecondsUpdated(oldCooldown, newCooldown);
    }

    function openNewBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        batchClosed[currentBatchId] = false;
        emit BatchOpened(currentBatchId);
    }

    function closeCurrentBatch() external onlyOwner whenNotPaused {
        batchClosed[currentBatchId] = true;
        emit BatchClosed(currentBatchId);
    }

    function submitLifeSignal(uint256 _encryptedTimestamp) external onlyProvider whenNotPaused checkSubmissionCooldown {
        if (batchClosed[currentBatchId]) revert BatchClosedOrInvalid();

        lastSubmissionTime[msg.sender] = block.timestamp;

        euint32 memory newTimestamp = FHE.asEuint32(_encryptedTimestamp);
        _initIfNeeded(encryptedLastSignalTimestamp, newTimestamp);

        encryptedLastSignalTimestamp = FHE.max(encryptedLastSignalTimestamp, newTimestamp);
        emit SignalSubmitted(msg.sender, currentBatchId);
    }

    function setInactivityThreshold(uint256 _encryptedThreshold) external onlyOwner whenNotPaused {
        euint32 memory threshold = FHE.asEuint32(_encryptedThreshold);
        if (!FHE.isInitialized(threshold)) revert InvalidThreshold();
        encryptedInactivityThreshold = threshold;
        emit ThresholdSet(currentBatchId, _encryptedThreshold);
    }

    function checkInheritanceTrigger() external whenNotPaused checkDecryptionCooldown {
        if (!FHE.isInitialized(encryptedLastSignalTimestamp) || !FHE.isInitialized(encryptedInactivityThreshold)) {
            revert InvalidThreshold(); // Or a more specific error
        }
        if (batchClosed[currentBatchId]) revert BatchClosedOrInvalid();

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        euint32 memory timeSinceLastSignal = FHE.sub(
            FHE.asEuint32(block.timestamp),
            encryptedLastSignalTimestamp
        );

        ebool memory trigger = FHE.ge(timeSinceLastSignal, encryptedInactivityThreshold);
        bytes32[] memory cts = new bytes32[](3);
        cts[0] = FHE.toBytes32(encryptedLastSignalTimestamp);
        cts[1] = FHE.toBytes32(encryptedInactivityThreshold);
        cts[2] = FHE.toBytes32(trigger);

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: currentBatchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, currentBatchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayDetected();

        // Rebuild ciphertexts array in the exact same order as in checkInheritanceTrigger
        euint32 memory currentEncLastSignal = encryptedLastSignalTimestamp;
        euint32 memory currentEncThreshold = encryptedInactivityThreshold;
        ebool memory currentEncTrigger = FHE.ge(
            FHE.sub(FHE.asEuint32(block.timestamp), currentEncLastSignal),
            currentEncThreshold
        );
        bytes32[] memory cts = new bytes32[](3);
        cts[0] = FHE.toBytes32(currentEncLastSignal);
        cts[1] = FHE.toBytes32(currentEncThreshold);
        cts[2] = FHE.toBytes32(currentEncTrigger);

        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert DecryptionFailed();
        }

        // Decode cleartexts in the same order
        uint256 lastSignal = abi.decode(cleartexts[0:32], (uint256));
        uint256 threshold = abi.decode(cleartexts[32:64], (uint256));
        bool triggerInheritance = abi.decode(cleartexts[64:96], (bool));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, lastSignal, threshold, triggerInheritance);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 storage target, euint32 memory value) internal {
        if (!FHE.isInitialized(target)) {
            target = value;
        }
    }
}