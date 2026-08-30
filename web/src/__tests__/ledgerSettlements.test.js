import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import * as ledgerEngine from '../engines/ledgerEngine';

describe('Ledger Settlement & Payment Management Engine', () => {
  beforeEach(async () => {
    await db.players.clear();
    await db.matches.clear();
    await db.teams.clear();
    await db.team_players.clear();
    await db.match_results.clear();
    await db.ledger_entries.clear();
    await db.ledger_payments.clear();
    await db.debt_adjustments.clear();
  });

  async function createFixture() {
    const rahul = await playerService.create('Rahul');
    const aman = await playerService.create('Aman');
    const vikram = await playerService.create('Vikram');
    const sameer = await playerService.create('Sameer');

    // Create a completed match with stakes where Team B (Aman) wins against Team A (Rahul)
    const match = await matchEngine.createMatch({ sport: 'volleyball' });
    const teamsData = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [rahul.id, vikram.id] },
        { label: 'Team B', player_ids: [aman.id, sameer.id] },
      ],
    });
    const teamA = teamsData.teams.find((t) => t.label === 'Team A');
    const teamB = teamsData.teams.find((t) => t.label === 'Team B');

    // Pairwise stakes: Rahul vs Aman (₹100), Vikram vs Sameer (₹50)
    await ledgerEngine.setMatchLedger(match.id, [
      { player_a_id: rahul.id, player_b_id: aman.id, amount: 100 },
      { player_a_id: vikram.id, player_b_id: sameer.id, amount: 50 },
    ]);

    await matchEngine.startMatch(match.id);
    await matchEngine.enterResult(match.id, {
      team_a_score: 18,
      team_b_score: 25,
      winning_team_id: teamB.id,
    });
    await matchEngine.endMatch(match.id, { reason: 'completed' });

    return { rahul, aman, vikram, sameer, match };
  }

  // ── 1. Full Settlement ──────────────────────────────────────────

  it('marks a debt as fully settled when the entire amount is paid', async () => {
    const { rahul, aman, match } = await createFixture();

    const debtsBefore = await ledgerEngine.getAllDebtsWithSettlement(db);
    expect(debtsBefore.outstandingDebts.length).toBe(2);

    const rahulDebt = debtsBefore.outstandingDebts.find(
      (d) => d.fromPlayer.id === rahul.id && d.toPlayer.id === aman.id
    );
    expect(rahulDebt).toBeDefined();
    expect(rahulDebt.originalAmount).toBe(100);
    expect(rahulDebt.remainingAmount).toBe(100);
    expect(rahulDebt.isSettled).toBe(false);

    // Record full payment of ₹100
    const payment = await ledgerEngine.recordPayment(
      {
        matchId: match.id,
        debtId: rahulDebt.debtId,
        fromPlayerId: rahul.id,
        toPlayerId: aman.id,
        amount: 100,
        note: 'GPay payment',
      },
      db
    );

    expect(payment.amount).toBe(100);
    expect(payment.fromPlayer.id).toBe(rahul.id);
    expect(payment.toPlayer.id).toBe(aman.id);

    // Verify debt settlement status
    const debtsAfter = await ledgerEngine.getAllDebtsWithSettlement(db);
    expect(debtsAfter.outstandingDebts.length).toBe(1); // Only Vikram vs Sameer left
    expect(debtsAfter.settledDebts.length).toBe(1);

    const settledRahul = debtsAfter.settledDebts.find((d) => d.fromPlayer.id === rahul.id);
    expect(settledRahul.totalPaid).toBe(100);
    expect(settledRahul.remainingAmount).toBe(0);
    expect(settledRahul.isSettled).toBe(true);

    // Settled debt should no longer appear in active colony debts
    const colonySummary = await ledgerEngine.getColonyLedgerSummary(db);
    const activeRahulDebts = colonySummary.colonyDebts.filter(
      (d) => d.fromPlayer.id === rahul.id
    );
    expect(activeRahulDebts.length).toBe(0);
  });

  // ── 2. Partial Payments ─────────────────────────────────────────

  it('records partial payments and calculates remaining balance accurately', async () => {
    const { rahul, aman, match } = await createFixture();

    // Rahul pays ₹40 of ₹100
    await ledgerEngine.recordPayment(
      {
        matchId: match.id,
        fromPlayerId: rahul.id,
        toPlayerId: aman.id,
        amount: 40,
        note: 'Cash installment 1',
      },
      db
    );

    const debtsAfterP1 = await ledgerEngine.getAllDebtsWithSettlement(db);
    const rahulDebt = debtsAfterP1.outstandingDebts.find(
      (d) => d.fromPlayer.id === rahul.id && d.toPlayer.id === aman.id
    );

    expect(rahulDebt.originalAmount).toBe(100);
    expect(rahulDebt.totalPaid).toBe(40);
    expect(rahulDebt.remainingAmount).toBe(60);
    expect(rahulDebt.isSettled).toBe(false);
    expect(rahulDebt.payments.length).toBe(1);

    // Colony summary active debt should reflect ₹60
    const summaryP1 = await ledgerEngine.getColonyLedgerSummary(db);
    const rahulColonyDebt = summaryP1.colonyDebts.find(
      (d) => d.fromPlayer.id === rahul.id && d.toPlayer.id === aman.id
    );
    expect(rahulColonyDebt.amount).toBe(60);
  });

  // ── 3. Multiple Partial Payments ────────────────────────────────

  it('handles multiple sequential partial payments until full settlement', async () => {
    const { rahul, aman, match } = await createFixture();

    // Payment 1: ₹40 (Remaining ₹60)
    await ledgerEngine.recordPayment(
      {
        matchId: match.id,
        fromPlayerId: rahul.id,
        toPlayerId: aman.id,
        amount: 40,
      },
      db
    );

    // Payment 2: ₹30 (Remaining ₹30)
    await ledgerEngine.recordPayment(
      {
        matchId: match.id,
        fromPlayerId: rahul.id,
        toPlayerId: aman.id,
        amount: 30,
      },
      db
    );

    let debts = await ledgerEngine.getAllDebtsWithSettlement(db);
    let rahulDebt = debts.outstandingDebts.find((d) => d.fromPlayer.id === rahul.id);
    expect(rahulDebt.totalPaid).toBe(70);
    expect(rahulDebt.remainingAmount).toBe(30);
    expect(rahulDebt.isSettled).toBe(false);

    // Payment 3: ₹30 (Remaining ₹0 -> Fully Settled!)
    await ledgerEngine.recordPayment(
      {
        matchId: match.id,
        fromPlayerId: rahul.id,
        toPlayerId: aman.id,
        amount: 30,
      },
      db
    );

    debts = await ledgerEngine.getAllDebtsWithSettlement(db);
    expect(debts.outstandingDebts.find((d) => d.fromPlayer.id === rahul.id)).toBeUndefined();

    const settled = debts.settledDebts.find((d) => d.fromPlayer.id === rahul.id);
    expect(settled).toBeDefined();
    expect(settled.totalPaid).toBe(100);
    expect(settled.remainingAmount).toBe(0);
    expect(settled.isSettled).toBe(true);
    expect(settled.payments.length).toBe(3);
  });

  // ── 4. Editing Debt Amount ──────────────────────────────────────

  it('allows editing debt amount with validation against negative amounts and paid thresholds', async () => {
    const { rahul, aman, match } = await createFixture();

    // Partial payment of ₹40
    await ledgerEngine.recordPayment(
      {
        matchId: match.id,
        fromPlayerId: rahul.id,
        toPlayerId: aman.id,
        amount: 40,
      },
      db
    );

    // Adjust debt to ₹80 (Colony discount agreed)
    const adj = await ledgerEngine.adjustDebtAmount(
      {
        matchId: match.id,
        fromPlayerId: rahul.id,
        toPlayerId: aman.id,
        newAmount: 80,
        reason: 'Discount agreed',
      },
      db
    );

    expect(adj.adjustedAmount).toBe(80);
    expect(adj.totalPaid).toBe(40);
    expect(adj.remainingAmount).toBe(40);

    const debts = await ledgerEngine.getAllDebtsWithSettlement(db);
    const rahulDebt = debts.outstandingDebts.find((d) => d.fromPlayer.id === rahul.id);
    expect(rahulDebt.currentDebtAmount).toBe(80);
    expect(rahulDebt.isAdjusted).toBe(true);
    expect(rahulDebt.remainingAmount).toBe(40);

    // Reject negative amount
    await expect(
      ledgerEngine.adjustDebtAmount(
        {
          matchId: match.id,
          fromPlayerId: rahul.id,
          toPlayerId: aman.id,
          newAmount: -10,
        },
        db
      )
    ).rejects.toThrow();

    // Reject new amount less than already paid (e.g. ₹30 when ₹40 is already paid)
    await expect(
      ledgerEngine.adjustDebtAmount(
        {
          matchId: match.id,
          fromPlayerId: rahul.id,
          toPlayerId: aman.id,
          newAmount: 30,
        },
        db
      )
    ).rejects.toThrow();
  });

  // ── 5. Undo / Edit Payment ──────────────────────────────────────

  it('allows undoing or updating an accidental payment and restores balance', async () => {
    const { rahul, aman, match } = await createFixture();

    const payment = await ledgerEngine.recordPayment(
      {
        matchId: match.id,
        fromPlayerId: rahul.id,
        toPlayerId: aman.id,
        amount: 50,
        note: 'Accidental entry',
      },
      db
    );

    let debts = await ledgerEngine.getAllDebtsWithSettlement(db);
    expect(debts.outstandingDebts.find((d) => d.fromPlayer.id === rahul.id).remainingAmount).toBe(50);

    // Update payment
    await ledgerEngine.updatePayment(payment.id, { amount: 60, note: 'Corrected note' }, db);
    debts = await ledgerEngine.getAllDebtsWithSettlement(db);
    expect(debts.outstandingDebts.find((d) => d.fromPlayer.id === rahul.id).remainingAmount).toBe(40);

    // Undo / delete payment
    const undoRes = await ledgerEngine.deletePayment(payment.id, db);
    expect(undoRes.success).toBe(true);

    debts = await ledgerEngine.getAllDebtsWithSettlement(db);
    const restoredDebt = debts.outstandingDebts.find((d) => d.fromPlayer.id === rahul.id);
    expect(restoredDebt.totalPaid).toBe(0);
    expect(restoredDebt.remainingAmount).toBe(100);
  });

  // ── 6. Payment History Preservation ─────────────────────────────

  it('preserves complete payment history with timestamps and notes', async () => {
    const { rahul, aman, match } = await createFixture();

    await ledgerEngine.recordPayment(
      {
        matchId: match.id,
        fromPlayerId: rahul.id,
        toPlayerId: aman.id,
        amount: 25,
        note: 'UPI Payment',
      },
      db
    );

    const summary = await ledgerEngine.getAllDebtsWithSettlement(db);
    expect(summary.allPayments.length).toBe(1);
    expect(summary.allPayments[0].amount).toBe(25);
    expect(summary.allPayments[0].note).toBe('UPI Payment');
    expect(summary.allPayments[0].fromPlayer.name).toBe('Rahul');
    expect(summary.allPayments[0].toPlayer.name).toBe('Aman');
  });

  // ── 7. Match Deletion Cleanup ───────────────────────────────────

  it('safely cleans up payments and debt adjustments when a match is deleted', async () => {
    const { rahul, aman, match } = await createFixture();

    await ledgerEngine.recordPayment(
      {
        matchId: match.id,
        fromPlayerId: rahul.id,
        toPlayerId: aman.id,
        amount: 50,
      },
      db
    );

    await ledgerEngine.adjustDebtAmount(
      {
        matchId: match.id,
        fromPlayerId: rahul.id,
        toPlayerId: aman.id,
        newAmount: 90,
      },
      db
    );

    const paymentsBefore = await db.ledger_payments.where('match_id').equals(match.id).toArray();
    expect(paymentsBefore.length).toBe(1);

    const adjustmentsBefore = await db.debt_adjustments.where('match_id').equals(match.id).toArray();
    expect(adjustmentsBefore.length).toBe(1);

    // Delete match
    await matchEngine.deleteMatch(match.id);

    // Payments and adjustments cleaned up
    const paymentsAfter = await db.ledger_payments.where('match_id').equals(match.id).toArray();
    expect(paymentsAfter).toEqual([]);

    const adjustmentsAfter = await db.debt_adjustments.where('match_id').equals(match.id).toArray();
    expect(adjustmentsAfter).toEqual([]);
  });
});
