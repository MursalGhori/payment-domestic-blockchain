import {
  Asset,
  Keypair,
  Memo,
  Network,
  Operation,
  Server,
  TransactionBuilder
} from 'stellar-sdk'

import { Prisma } from './generated/prisma'

export interface Context {
  db: Prisma
  request: any
}


export const AnchorXINR = new Asset(
  'INR',
  'GC7NKKGKGEB3EAJYOODV2P4KEC4Y2JKI5QUAJNBTCJB4HZKEMSMUQEP5'
)

export async function createAccountInLedger(newAccount: string) {
  try {

    Network.useTestNetwork();

    const stellarServer = new Server('https://horizon-testnet.stellar.org');

    const provisionerKeyPair = Keypair.fromSecret('SD3SZQFSPDOJ4M3XJVRIEYOBWUD3BRKAUAW7KFDBU7VWHEDX5WCNYK6Y')

    const provisioner = await stellarServer.loadAccount(provisionerKeyPair.publicKey())

    console.log('creating account in ledger', newAccount)

    const transaction = new TransactionBuilder(provisioner)
      .addOperation(
        Operation.createAccount({
          destination: newAccount,
          startingBalance: '10'
        })
      ).build()

    transaction.sign(provisionerKeyPair)

    const result = await stellarServer.submitTransaction(transaction);
    console.log('Account created: ', result)
  } catch (e) {
    console.log('Stellar account not created.', e)
  }
}


export async function createTrustline(accountKeypair: Keypair) {
  Network.useTestNetwork();
  const stellarServer = new Server('https://horizon-testnet.stellar.org');

  try {
    const account = await stellarServer.loadAccount(accountKeypair.publicKey())
    const transaction = new TransactionBuilder(account)
      .addOperation(
        Operation.changeTrust({
          asset: AnchorXINR
        }))
      .build();

    transaction.sign(accountKeypair)

    const result = await stellarServer.submitTransaction(transaction)

    console.log('trustline created from  account to issuer and signers updated', result)

    return result
  } catch (e) {
    console.log('create trustline failed.', e)
  }
}


export async function allowTrust(trustor: string) {
  Network.useTestNetwork();
  const stellarServer = new Server('https://horizon-testnet.stellar.org');

  try {
   
    const issuingKeys = Keypair.fromSecret('SBV5ANEJM37XSJSUQQWNEQAT5PCKRU22AR3HFS425NHBAX45ZXUVJK7H')
    const issuingAccount = await stellarServer.loadAccount(issuingKeys.publicKey())

    const transaction = new TransactionBuilder(issuingAccount)
      .addOperation(
        Operation.allowTrust({
          trustor,
          assetCode: AnchorXINR.code,
          authorize: true
        })
      )
      .build();

    transaction.sign(issuingKeys);

    const result = await stellarServer.submitTransaction(transaction)

    console.log('trust allowed', result)

    return result
  } catch (e) {
    console.log('allow trust failed', e)
  }
}


export async function payment(signerKeys: Keypair, destination: string, amount: string) {
  Network.useTestNetwork();
  const stellarServer = new Server('https://horizon-testnet.stellar.org');

  const account = await stellarServer.loadAccount(signerKeys.publicKey())

  let transaction = new TransactionBuilder(account)
    .addOperation(
      Operation.payment({
        destination,
        asset: AnchorXINR,
        amount
      })
    ).addMemo(Memo.text('https://goo.gl/6pDRPi'))
    .build()

  transaction.sign(signerKeys)

  try {

    const { hash } = await stellarServer.submitTransaction(transaction)
    
    return { id: hash }
  } catch (e) {
    console.log(`failure ${e}`)
    throw e
  }
}