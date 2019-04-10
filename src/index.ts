import { GraphQLServer } from 'graphql-yoga'
import { importSchema } from 'graphql-import'
import { Prisma } from './generated/prisma'
import {
  Context,
  allowTrust,
  createAccountInLedger,
  createTrustline,
  payment
} from './utils'

import {
  Asset,
  Keypair,
  Memo,
  Network,
  Operation,
  Server,
  TransactionBuilder
} from 'stellar-sdk'

import axios from 'axios'
import { AES, enc } from 'crypto-js'

const ENVCryptoSecret = 'Siddharth-********************'

const resolvers = {
  Query: {
    user(_, { username }, context: Context, info) {
      return context.db.query.user(
        {
          where: {
            username
          }
        },
        info
      )
    }
  },
  Mutation: {
    async signup(_, { username }, context: Context, info) {
      const keypair = Keypair.random()

      const secret = AES.encrypt(
        keypair.secret(),
        ENVCryptoSecret
      ).toString()

      const data = {
        username,
        stellarAccount: keypair.publicKey(),
        stellarSeed: secret
      }

      const user = await context.db.mutation.createUser(
        { data },
        info
      )

      console.log("=============1==============")
      await createAccountInLedger(keypair.publicKey())
      console.log("=============2==============")
      await createTrustline(keypair)
      console.log("=============3==============")
      await allowTrust(keypair.publicKey())
      console.log("=============4==============")
      await payment(
        // keypair for issuing account 
        Keypair.fromSecret('SD3SZQFSPDOJ4M3XJVRIEYOBWUD3BRKAUAW7KFDBU7VWHEDX5WCNYK6Y'),
        keypair.publicKey(),
        '1000'
      )
      console.log(" account created !")

      return user
    },
    
    async payment(_, { amount, senderUsername, recipientUsername, memo }, context: Context, info) {
      const result = await context.db.query.users({
        where: {
          username_in: [senderUsername, recipientUsername]
        }
      })

      const sender = result.find(u => u.username === senderUsername)
      const recipient = result.find(u => u.username === recipientUsername)

      const signerKeys = Keypair.fromSecret(
        // Use something like KMS in production
        AES.decrypt(
          sender.stellarSeed,
          ENVCryptoSecret
        ).toString(enc.Utf8)
      )

      try {
        const hash = await payment(
          signerKeys,
          recipient.stellarAccount,
          amount
        )

        return { id: hash }
      } catch (e) {
        console.log(`failure ${e}`)

        throw e
      }
    },

      
    async credit(_, { amount, username }, context: Context, info) {
      const user = await context.db.query.user({
        where: {
          username: username
        }
      })

      try {
        const hash = await payment(
          // keypair for issuing account - no bueno
          Keypair.fromSecret('SD3SZQFSPDOJ4M3XJVRIEYOBWUD3BRKAUAW7KFDBU7VWHEDX5WCNYK6Y'),
          user.stellarAccount,
          amount
        )

        return { id: hash }
      } catch (e) {
        console.log(`failure ${e}`)

        throw e
      }
    },
    async debit(_, { amount, username }, context: Context, info) {
      const user = await context.db.query.user({
        where: {
          username: username
        }
      })

      const keypair = Keypair.fromSecret(
        AES.decrypt(
          user.stellarSeed,
          ENVCryptoSecret
        ).toString(enc.Utf8)
      )

      // When you send back a custom asset to the issuing account, the
      // asset you send back get destroyed
      const issuingAccount = 'GC7NKKGKGEB3EAJYOODV2P4KEC4Y2JKI5QUAJNBTCJB4HZKEMSMUQEP5'

      try {
        const hash = await payment(
          keypair,
          issuingAccount,
          amount
        )

        console.log(`account ${keypair.publicKey()} debited - now transfer real money to ${username} bank account`)

        return { id: hash }
      } catch (e) {
        console.log(`failure ${e}`)

        throw e
      }
    }
  },
}

const server = new GraphQLServer({
  typeDefs: './src/schema.graphql',
  resolvers,
  context: req => ({
    ...req,
    db: new Prisma({
      endpoint: 'https://us1.prisma.sh/public-gravelcloud-78/anchorx-api/dev', // the endpoint of the Prisma API
      debug: true,
      // secret: 'mysecret123',
    }),
  }),
})
server.start(() => console.log('Server is running on http://localhost:4000'))