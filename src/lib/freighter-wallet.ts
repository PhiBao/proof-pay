import {
  getNetworkDetails,
  isConnected,
  requestAccess,
  signTransaction
} from "@stellar/freighter-api";
import type { SignTransaction } from "@stellar/stellar-sdk/contract";
import { networkConfig } from "@/lib/demo-data";

type FreighterError = {
  code?: number;
  message?: string;
};

export type WalletState =
  | {
      status: "idle";
      message: string;
    }
  | {
      status: "missing" | "rejected" | "wrong-network" | "error";
      message: string;
      address?: string;
      networkName?: string;
      networkPassphrase?: string;
    }
  | {
      status: "connected";
      message: string;
      address: string;
      networkName: string;
      networkPassphrase: string;
    };

function walletErrorMessage(error?: FreighterError): string {
  if (!error) return "Wallet request failed. Try again from Freighter.";
  if (error.code === -4) return "Connection rejected in Freighter.";
  return error.message ?? "Wallet request failed. Try again from Freighter.";
}

export function shortAddress(address?: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function connectFreighterWallet(): Promise<WalletState> {
  if (typeof window === "undefined") {
    return {
      status: "error",
      message: "Wallets can only connect from the browser."
    };
  }

  const connection = await isConnected();
  if (connection.error) {
    return {
      status: "error",
      message: walletErrorMessage(connection.error)
    };
  }

  if (!connection.isConnected) {
    return {
      status: "missing",
      message: "Install Freighter, then refresh this page."
    };
  }

  const access = await requestAccess();
  if (access.error) {
    return {
      status: access.error.code === -4 ? "rejected" : "error",
      message: walletErrorMessage(access.error)
    };
  }

  if (!access.address) {
    return {
      status: "error",
      message: "Freighter did not return an account address."
    };
  }

  const network = await getNetworkDetails();
  if (network.error) {
    return {
      status: "error",
      address: access.address,
      message: walletErrorMessage(network.error)
    };
  }

  if (network.networkPassphrase !== networkConfig.passphrase) {
    return {
      status: "wrong-network",
      address: access.address,
      networkName: network.network || "Unknown network",
      networkPassphrase: network.networkPassphrase,
      message: "Switch Freighter to Stellar Testnet."
    };
  }

  return {
    status: "connected",
    address: access.address,
    networkName: network.network || networkConfig.name,
    networkPassphrase: network.networkPassphrase,
    message: "Freighter connected."
  };
}

export function freighterSigner(address: string): SignTransaction {
  return async (transactionXdr, options) =>
    signTransaction(transactionXdr, {
      ...options,
      address,
      networkPassphrase: networkConfig.passphrase
    });
}

