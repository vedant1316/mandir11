/**
 * Mandir 11 — Client-Side Canvas Scoreboard Generator
 * Generates shareable, high-resolution PNG scorecards for mobile & WhatsApp sharing.
 */
import { exportImageFile } from './fileExportService';

// Helper to draw rounded rectangle
function drawRoundedRect(ctx, x, y, width, height, radius, fill = true, stroke = false) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

/**
 * Renders a full match scoreboard to an HTML5 Canvas element
 */
export function generateScoreboardCanvas({ match, scorecard, settlement, allPlayers = [] }) {
  const width = 1080;
  const height = 1350;

  if (typeof document === 'undefined') {
    return { width, height };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) return canvas;

  const isPosition = match.sport === 'position';
  const isCricket = match.sport === 'cricket';
  const isTest = isCricket && (match.cricket_format === 'test' || match.format === 'test');

  const teamA = match.teams?.find((t) => t.label === 'Team A') || match.teams?.[0];
  const teamB = match.teams?.find((t) => t.label === 'Team B') || match.teams?.[1];

  const winner = match.result?.winning_team_id
    ? match.teams?.find((t) => t.id === match.result.winning_team_id)
    : null;

  // ─── 1. Background Gradient & Canvas Frame ────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0B0F19');
  bgGrad.addColorStop(0.5, '#0F172A');
  bgGrad.addColorStop(1, '#1E293B');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle ambient glow circles
  const glow1 = ctx.createRadialGradient(200, 200, 20, 200, 200, 450);
  glow1.addColorStop(0, 'rgba(59, 130, 246, 0.12)');
  glow1.addColorStop(1, 'rgba(59, 130, 246, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(880, 700, 20, 880, 700, 400);
  glow2.addColorStop(0, 'rgba(245, 158, 11, 0.08)');
  glow2.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  // Outer border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, 24, 24, width - 48, height - 48, 24, false, true);

  // ─── 2. Top Header & Branding ────────────────────────────────────
  // Mandir 11 Logo Badge
  ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
  drawRoundedRect(ctx, 60, 60, 220, 48, 24, true, false);
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 60, 60, 220, 48, 24, false, true);

  ctx.fillStyle = '#60A5FA';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏆 MANDIR 11', 170, 92);

  // Sport & Format Tag
  const sportLabel = isPosition
    ? '🏅 POSITION MATCH'
    : isTest
    ? '🛡️ TEST CRICKET'
    : isCricket
    ? '🏏 CRICKET'
    : match.sport === 'volleyball'
    ? '🏐 VOLLEYBALL'
    : '🏸 BADMINTON';

  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  drawRoundedRect(ctx, width - 290, 60, 230, 48, 24, true, false);
  ctx.fillStyle = '#F3F4F6';
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(sportLabel, width - 175, 92);

  // Match Date & Colony tagline
  const dateFormatted = new Date(match.date || match.created_at || Date.now()).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  ctx.fillStyle = '#94A3B8';
  ctx.font = '16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(dateFormatted, 60, 145);

  ctx.fillStyle = '#64748B';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('OFFICIAL MATCH SCORECARD', width - 60, 145);

  // Divider Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(60, 165);
  ctx.lineTo(width - 60, 165);
  ctx.stroke();

  // ─── Special Layout for Position Match ────────────────────────────
  if (isPosition) {
    const rankings = match.result?.hydratedRankings || match.result?.rankings || [];
    const sortedRankings = [...rankings].sort((a, b) => (a.position || 0) - (b.position || 0));

    const firstPlace = sortedRankings.find((r) => r.position === 1);
    const winnerPlayer = firstPlace?.player || allPlayers.find((p) => p.id === (firstPlace?.player_id || match.result?.winner_player_id));
    const winnerName = winnerPlayer?.name || 'Winner';

    let currentY = 195;
    ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
    drawRoundedRect(ctx, 60, currentY, width - 120, 80, 20, true, false);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, 60, currentY, width - 120, 80, 20, false, true);

    ctx.fillStyle = '#34D399';
    ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`👑  1ST PLACE WINNER: ${winnerName.toUpperCase()} (+3 PTS)`, width / 2, currentY + 50);

    currentY += 105;

    const cardHeight = Math.max(380, sortedRankings.length * 72 + 100);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
    drawRoundedRect(ctx, 60, currentY, width - 120, cardHeight, 24, true, false);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 60, currentY, width - 120, cardHeight, 24, false, true);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#60A5FA';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.fillText('🏅 OFFICIAL FINAL PLACEMENTS & POINTS', 95, currentY + 45);

    let rowY = currentY + 70;
    sortedRankings.forEach((r) => {
      const pObj = r.player || allPlayers.find((p) => p.id === r.player_id);
      const pName = pObj?.name || 'Player';
      const pos = r.position;
      const pts = r.points ?? (pos === 1 ? 3 : pos === 2 ? 2 : pos === 3 ? 1 : 0);

      const rowBg = pos === 1
        ? 'rgba(245, 158, 11, 0.15)'
        : pos === 2
        ? 'rgba(148, 163, 184, 0.12)'
        : pos === 3
        ? 'rgba(217, 119, 6, 0.12)'
        : 'rgba(51, 65, 85, 0.3)';

      const medal = pos === 1 ? '🥇 1st' : pos === 2 ? '🥈 2nd' : pos === 3 ? '🥉 3rd' : `${pos}th`;
      const posColor = pos === 1 ? '#FBBF24' : pos === 2 ? '#E2E8F0' : pos === 3 ? '#F59E0B' : '#94A3B8';

      ctx.fillStyle = rowBg;
      drawRoundedRect(ctx, 95, rowY, width - 190, 56, 14, true, false);

      ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = posColor;
      ctx.textAlign = 'left';
      ctx.fillText(medal, 115, rowY + 36);

      ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(pName, 240, rowY + 36);

      ctx.textAlign = 'right';
      ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = pts > 0 ? '#34D399' : '#64748B';
      ctx.fillText(`+${pts} pts`, width - 120, rowY + 36);

      rowY += 66;
    });

    const ruleY = currentY + cardHeight + 25;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    drawRoundedRect(ctx, 60, ruleY, width - 120, 56, 14, true, false);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, 60, ruleY, width - 120, 56, 14, false, true);

    ctx.fillStyle = '#93C5FD';
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⭐ Ranking Points System: 1st: 3 pts · 2nd: 2 pts · 3rd: 1 pt · 4th and below: 0 pts', width / 2, ruleY + 34);

    const footerY = height - 55;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(60, footerY - 25);
    ctx.lineTo(width - 60, footerY - 25);
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Mandir 11 · Local-First Colony Sports Platform', 60, footerY);

    ctx.textAlign = 'right';
    ctx.fillText(`Match ID: ${match.id?.slice(0, 8)}`, width - 60, footerY);

    return canvas;
  }

  // ─── 3. Main Teams & Scores Card ─────────────────────────────────
  let currentY = 195;

  // Background Box for Scores
  ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
  drawRoundedRect(ctx, 60, currentY, width - 120, 250, 24, true, false);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 60, currentY, width - 120, 250, 24, false, true);

  // Team A Column (Left)
  const isWinnerA = winner?.label === 'Team A';
  const isWinnerB = winner?.label === 'Team B';

  ctx.textAlign = 'left';
  ctx.fillStyle = isWinnerA ? '#34D399' : '#60A5FA';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.fillText(`TEAM A ${isWinnerA ? '🏆' : ''}`, 95, currentY + 45);

  // Team A Players
  const teamAPlayersStr = teamA?.players?.map((p) => p.player?.name || 'Player').join(', ') || '';
  ctx.fillStyle = '#94A3B8';
  ctx.font = '15px system-ui, -apple-system, sans-serif';
  const truncatedTeamA = teamAPlayersStr.length > 40 ? teamAPlayersStr.substring(0, 37) + '…' : teamAPlayersStr;
  ctx.fillText(truncatedTeamA, 95, currentY + 75);

  // Team A Score
  if (isCricket && isTest && scorecard) {
    const teamAInnings = scorecard.innings.filter((i) => i.battingTeam?.id === teamA?.id);
    let innY = currentY + 120;
    teamAInnings.forEach((inn, idx) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
      ctx.fillText(`Inn ${idx + 1}: ${inn.totalRuns}/${inn.totalWickets}`, 95, innY);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '16px system-ui, -apple-system, sans-serif';
      ctx.fillText(`(${inn.oversFormatted} ov)${inn.innings.is_declared ? ' d' : ''}`, 265, innY);
      innY += 40;
    });
  } else if (isCricket && scorecard) {
    const innA = scorecard.innings.find((i) => i.battingTeam?.id === teamA?.id);
    const runsA = innA?.totalRuns ?? match.result?.team_a_score ?? 0;
    const wktsA = innA?.totalWickets ?? 0;
    const ovsA = innA?.oversFormatted ?? '0.0';

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 52px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${runsA}/${wktsA}`, 95, currentY + 145);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.fillText(`(${ovsA} ov)${innA?.innings.is_declared ? ' d' : ''}`, 95, currentY + 185);
  } else {
    // Non-cricket (Volleyball / Badminton)
    const scoreA = match.result?.team_a_score ?? '—';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 68px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${scoreA}`, 95, currentY + 160);
  }

  // VS Separator
  ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
  drawRoundedRect(ctx, width / 2 - 28, currentY + 95, 56, 56, 28, true, false);
  ctx.fillStyle = '#FBBF24';
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('VS', width / 2, currentY + 130);

  // Team B Column (Right)
  ctx.textAlign = 'right';
  ctx.fillStyle = isWinnerB ? '#34D399' : '#F59E0B';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${isWinnerB ? '🏆 ' : ''}TEAM B`, width - 95, currentY + 45);

  // Team B Players
  const teamBPlayersStr = teamB?.players?.map((p) => p.player?.name || 'Player').join(', ') || '';
  ctx.fillStyle = '#94A3B8';
  ctx.font = '15px system-ui, -apple-system, sans-serif';
  const truncatedTeamB = teamBPlayersStr.length > 40 ? teamBPlayersStr.substring(0, 37) + '…' : teamBPlayersStr;
  ctx.fillText(truncatedTeamB, width - 95, currentY + 75);

  // Team B Score
  if (isCricket && isTest && scorecard) {
    const teamBInnings = scorecard.innings.filter((i) => i.battingTeam?.id === teamB?.id);
    let innY = currentY + 120;
    teamBInnings.forEach((inn, idx) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
      ctx.fillText(`Inn ${idx + 1}: ${inn.totalRuns}/${inn.totalWickets}`, width - 215, innY);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '16px system-ui, -apple-system, sans-serif';
      ctx.fillText(`(${inn.oversFormatted} ov)${inn.innings.is_declared ? ' d' : ''}`, width - 95, innY);
      innY += 40;
    });
  } else if (isCricket && scorecard) {
    const innB = scorecard.innings.find((i) => i.battingTeam?.id === teamB?.id);
    const runsB = innB?.totalRuns ?? match.result?.team_b_score ?? 0;
    const wktsB = innB?.totalWickets ?? 0;
    const ovsB = innB?.oversFormatted ?? '0.0';

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 52px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${runsB}/${wktsB}`, width - 95, currentY + 145);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.fillText(`(${ovsB} ov)${innB?.innings.is_declared ? ' d' : ''}`, width - 95, currentY + 185);
  } else {
    // Non-cricket
    const scoreB = match.result?.team_b_score ?? '—';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 68px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${scoreB}`, width - 95, currentY + 160);
  }

  // ─── 4. Winner Announcement Banner ──────────────────────────────
  currentY += 275;

  let summaryText = 'Match Completed';
  if (isCricket && scorecard?.resultSummary) {
    summaryText = scorecard.resultSummary;
  } else if (winner) {
    summaryText = `${winner.label} Won The Match!`;
  } else if (match.end_reason === 'draw' || (match.result && !match.result.winning_team_id)) {
    summaryText = 'Match Tied / Drawn';
  }

  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  drawRoundedRect(ctx, 60, currentY, width - 120, 64, 18, true, false);
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 60, currentY, width - 120, 64, 18, false, true);

  ctx.fillStyle = '#34D399';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`👑  ${summaryText.toUpperCase()}`, width / 2, currentY + 41);

  // ─── 5. Player of the Match (MVP) Section (Cricket Only) ──────────
  if (isCricket) {
    currentY += 88;

    const pomId = match.player_of_match_id || scorecard?.playerOfMatch?.id;
    const pomPlayer = pomId
      ? allPlayers.find((p) => p.id === pomId) || scorecard?.playerOfMatch
      : null;

    // Pre-calculate MVP breakdown
    const mvpScores = scorecard?.mvpDetails?.mvpScores || [];
    const topMvpScore = mvpScores.find((s) => s.playerId === pomId) || mvpScores[0];

    ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
    drawRoundedRect(ctx, 60, currentY, width - 120, 180, 20, true, false);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, 60, currentY, width - 120, 180, 20, false, true);

    // MVP Badge
    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('⭐ MAN OF THE MATCH (MVP)', 95, currentY + 40);

    if (topMvpScore) {
      ctx.fillStyle = '#FBBF24';
      ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`+${topMvpScore.totalPoints} MVP PTS`, width - 95, currentY + 40);
    }

    // MVP Player Name
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 32px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(pomPlayer?.name || topMvpScore?.playerName || 'Player of the Match', 95, currentY + 85);

    // Breakdown details
    if (topMvpScore) {
      const outcomeText = topMvpScore.outcome === 'win' ? 'Win (+10)' : topMvpScore.outcome === 'tie' ? 'Tie (+5)' : 'Loss (+2)';
      const statsDetail = `${outcomeText} · Runs: ${topMvpScore.runs} (+${topMvpScore.runPoints}) · Wickets: ${topMvpScore.wickets} (+${topMvpScore.wicketPoints})`;

      ctx.fillStyle = '#E2E8F0';
      ctx.font = '16px system-ui, -apple-system, sans-serif';
      ctx.fillText(statsDetail, 95, currentY + 120);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '13px system-ui, -apple-system, sans-serif';
      ctx.fillText(`Formula: (Win +10 / Loss +2 / Tie +5) + (Runs × 1) + (Wickets × 5)`, 95, currentY + 150);
    } else {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '16px system-ui, -apple-system, sans-serif';
      ctx.fillText('Recognized for standout colony performance', 95, currentY + 125);
    }

    currentY += 205;
  }

  // ─── 6. Key Performers / Top Contributions (Cricket) ─────────────

  if (isCricket && scorecard && scorecard.innings?.length > 0) {
    // Find top batter and top bowler across all innings
    let topBatter = { name: '—', runs: 0, balls: 0, fours: 0, sixes: 0 };
    let topBowler = { name: '—', wickets: 0, runs: 0, overs: '0.0' };

    scorecard.innings.forEach((inn) => {
      inn.battingScorecard?.forEach((b) => {
        if (b.runs > topBatter.runs) {
          topBatter = { name: b.name, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes };
        }
      });
      inn.bowlingScorecard?.forEach((bw) => {
        if (bw.wickets > topBowler.wickets || (bw.wickets === topBowler.wickets && bw.runsConceded < topBowler.runs)) {
          topBowler = { name: bw.name, wickets: bw.wickets, runs: bw.runsConceded, overs: bw.overs };
        }
      });
    });

    const cardWidth = (width - 140) / 2;

    // Top Batter Card
    ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
    drawRoundedRect(ctx, 60, currentY, cardWidth, 140, 16, true, false);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    drawRoundedRect(ctx, 60, currentY, cardWidth, 140, 16, false, true);

    ctx.fillStyle = '#60A5FA';
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🏏 TOP BATTER', 80, currentY + 32);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(topBatter.name, 80, currentY + 68);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '16px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${topBatter.runs} runs (${topBatter.balls}b) · ${topBatter.fours}×4, ${topBatter.sixes}×6`, 80, currentY + 102);

    // Top Bowler Card
    ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
    drawRoundedRect(ctx, 60 + cardWidth + 20, currentY, cardWidth, 140, 16, true, false);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    drawRoundedRect(ctx, 60 + cardWidth + 20, currentY, cardWidth, 140, 16, false, true);

    ctx.fillStyle = '#34D399';
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.fillText('🎯 TOP BOWLER', 60 + cardWidth + 40, currentY + 32);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(topBowler.name, 60 + cardWidth + 40, currentY + 68);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '16px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${topBowler.wickets} wkts for ${topBowler.runs} runs (${topBowler.overs} ov)`, 60 + cardWidth + 40, currentY + 102);

    currentY += 165;
  }

  // ─── 7. Ledger Settlement Box (if present) ────────────────────────
  if (settlement && settlement.hasStakes && settlement.isSettled) {
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    drawRoundedRect(ctx, 60, currentY, width - 120, 60, 14, true, false);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, 60, currentY, width - 120, 60, 14, false, true);

    ctx.fillStyle = '#93C5FD';
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`💰 MATCH LEDGER: ₹${settlement.totalPool} Pool Settled (${settlement.payments?.length || 0} peer payments)`, 85, currentY + 36);

    currentY += 80;
  }

  // ─── 8. Footer & Local-First Watermark ────────────────────────────
  const footerY = height - 55;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(60, footerY - 25);
  ctx.lineTo(width - 60, footerY - 25);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Mandir 11 · Local-First Colony Sports Platform', 60, footerY);

  ctx.textAlign = 'right';
  ctx.fillText(`Match ID: ${match.id?.slice(0, 8)}`, width - 60, footerY);

  return canvas;
}

/**
 * Triggers download or export of the scoreboard PNG image across web and Android
 */
export async function downloadScoreboardImage({ match, scorecard, settlement, allPlayers = [] }) {
  if (!match) {
    throw new Error('Match data is required to generate a scorecard.');
  }

  const canvas = generateScoreboardCanvas({ match, scorecard, settlement, allPlayers });
  const filename = `mandir11_${match.sport || 'match'}_${match.id?.slice(0, 8) || 'match'}.png`;

  if (!canvas || typeof canvas.toBlob !== 'function') {
    return { success: true, filename, method: 'mock' };
  }

  return exportImageFile({
    filename,
    canvas,
    mimeType: 'image/png',
  });
}

/**
 * Copies scoreboard PNG to clipboard if supported by browser
 */
export async function copyScoreboardImage({ match, scorecard, settlement, allPlayers = [] }) {
  const canvas = generateScoreboardCanvas({ match, scorecard, settlement, allPlayers });
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Failed to create image blob'));
        return;
      }
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (err) {
        reject(err);
      }
    }, 'image/png');
  });
}
