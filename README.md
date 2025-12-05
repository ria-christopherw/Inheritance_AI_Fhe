# Inheritance AI: A FHE-based Digital Inheritance Service

Inheritance AI is a pioneering solution that leverages **Zama's Fully Homomorphic Encryption technology** to create a secure and reliable digital inheritance service. By utilizing AI to verify users' "proof of life" through encrypted digital interactions, our service ensures that your digital legacy is protected and transferred seamlessly when the time comes.

## The Problem We're Solving

In an increasingly digital world, many individuals have accumulated vast online assets, from social media accounts to digital currencies. Yet, there is a significant challenge: how do we ensure that these assets are transferred securely and legally to our heirs after our passing? Existing inheritance methods are often clunky, time-consuming, and lack privacy, leaving many users uncertain about the fate of their digital legacies.

## The FHE Solution

Inheritance AI addresses these issues head-on by implementing a transformative approach to digital inheritance. Our system utilizes **Fully Homomorphic Encryption (FHE)**, which allows data to be processed while still encrypted. This means that sensitive data, such as users' "proof of life" indicators derived from ongoing digital activity, remains private and secure throughout the entire verification process.

We rely on **Zama's open-source libraries**, such as **Concrete** and the **zama-fhe SDK**, to integrate FHE into our protocol. This ensures not only the confidentiality of users' data but also leverages advanced AI algorithms to assess the user's state based on encrypted signals, automatically triggering inheritance procedures in the absence of activity over an extended period.

## Key Features

- **FHE Encrypted “Proof of Life”:** Tracks user's digital interactions while keeping data secure with FHE.
- **AI-Driven Monitoring:** An AI agent evaluates ongoing digital presence to determine "proof of life."
- **Automated Inheritance Trigger:** Seamlessly activates a secure inheritance process should prolonged inactivity occur.
- **Privacy First:** Utilizes state-of-the-art encryption techniques to ensure all user data remains confidential.
- **Comprehensive Digital Asset Management:** Manages various types of digital assets, ensuring a holistic approach to digital inheritance.

## Technology Stack

- **Zama's Fully Homomorphic Encryption SDK**: The cornerstone of our encrypted processing.
- **Node.js**: For building a robust server-side application.
- **Hardhat/Foundry**: For smart contract development and deployment.
- **AI Algorithms**: For evaluating user interaction data to confirm "proof of life."

## Directory Structure

Here’s the standard file layout for the Inheritance AI project:

```
/Inheritance_AI_Fhe
├── contracts
│   └── Inheritance_AI.sol
├── scripts
│   └── deploy.js
├── test
│   └── InheritanceAI.test.js
├── src
│   └── index.js
├── package.json
└── README.md
```

## Installation Guide

To set up the project on your local machine:

1. Ensure you have **Node.js** installed.
2. Navigate to the project directory you have downloaded.
3. Run the following command to install the necessary dependencies:

   ```bash
   npm install
   ```

This command will fetch required Zama FHE libraries along with other dependencies needed for the project.

## Build & Run Guide

After installing the dependencies, you can compile the smart contracts, run tests, and launch the application using the commands below:

### Compile the Smart Contracts

```bash
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

### Deploy the Contracts

To deploy the smart contracts to the desired blockchain network, use:

```bash
npx hardhat run scripts/deploy.js --network <network-name>
```

### Start the Application

To start the server:

```bash
node src/index.js
```

If everything is set up correctly, your digital inheritance service will be up and running!

## Acknowledgements

This project would not be possible without the groundbreaking efforts of the Zama team. Their pioneering work on Fully Homomorphic Encryption and commitment to open-source tools empowers developers to create innovative, confidential blockchain applications. Thank you for making this journey feasible!

---

Inheritance AI is not just a project—it's a revolution in managing one's digital legacy with utmost privacy and security. Experience peace of mind knowing your digital assets are protected, all while leveraging the powerful technology from Zama's FHE ecosystem.