require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
      viaIR: true,
    }
  },
  networks: {
    sepolia: {
      url: `https://ethereum-sepolia-rpc.publicnode.com`,
      accounts: [process.env.PRIVATE_KEY],
      chainId: 11155111
    },
    // holesky: {
    //   url: `https://ethereum-holesky.publicnode.com`,
    //   accounts: [process.env.PRIVATE_KEY],
    //   chainId: 17000
    // },
    //  mantaPacificSepolia: {
    //   url: "https://pacific-rpc.sepolia-testnet.manta.network/http",
    //   accounts: [process.env.PRIVATE_KEY],
    //   chainId: 3441006
    // },
    optimism: {
      url: `https://sepolia.optimism.io`,
      accounts: [process.env.PRIVATE_KEY],
      chainId: 11155420,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "optimism",
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
          browserURL: "https://sepolia-optimism.etherscan.io/",
        },
      },
    ],
  },
  // etherscan: {
  //   apiKey: {
  //     holesky: `${process.env.ETHERSCAN_API_KEY}`,
  //   },
  // },
  // etherscan: {
  //   apiKey: {
  //     mantaPacificSepolia: process.env.ETHERSCAN_API_KEY
  //   },
  // },
};