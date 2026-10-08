import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// ---- Import all schema modules ----
import * as users from "./users";
import * as events from "./events";
import * as eventSequences from "./eventSequences";
import * as eventTickets from "./eventTickets";
import * as ticketCategories from "./ticketCategories";
import * as ticketTypes from "./ticketTypes";
import * as orders from "./orders";
import * as orderTickets from "./orderTickets";
import * as orderSequence from "./orderSequence";
import * as ticketSequence from "./ticketSequence";
import * as appSettings from "./appSettings";

// ---- Finance tables ----
import * as incomes from "./incomes";
import * as incomeReceipts from "./incomeReceipts";
import * as expenses from "./expenses";
import * as expensePayments from "./expensePayments";
import * as paymentMethodCosts from "./paymentMethodCosts";
import * as emailCampaigns from "./emailCampaigns";
import * as discountCodes from "./discountCodes";
import * as discountCodeUses from "./discountCodeUses";

// ⭐ NEW — seating tables
import * as seatingMaps from "./seatingMaps";
import * as seatingSections from "./seatingSections";
import * as seats from "./seats";

// Raffle
import * as raffles from "./raffles";
import * as raffleWinners from "./raffleWinners";

/* ============================
   NEON POSTGRES CLIENT
============================ */

const client = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
});

/* ============================
   DRIZZLE ORM INSTANCE
============================ */

export const db = drizzle(client, {
  schema: {
    ...users,
    ...events,
    ...eventSequences,
    ...eventTickets,
    ...ticketCategories,
    ...ticketTypes,
    ...orders,
    ...orderTickets,
    ...orderSequence,
    ...ticketSequence,
    ...appSettings,
    ...incomes,
    ...incomeReceipts,
    ...expenses,
    ...expensePayments,
    ...paymentMethodCosts,
    // ⭐ Fixed — these were imported but missing from the registry
    ...emailCampaigns,
    ...discountCodes,
    ...discountCodeUses,
    // ⭐ NEW
    ...seatingMaps,
    ...seatingSections,
    ...seats,
  },
});