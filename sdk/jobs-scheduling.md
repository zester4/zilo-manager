# ZilMate SDK: Jobs & Background Scheduling

ZilMate incorporates a **durable, serverless-friendly task scheduler**. You can schedule recurring cron jobs, enqueue delayed tasks, spin up background worker processes, and coordinate execution hooks using Upstash QStash.

---

## 1. Creating and Scheduling Jobs

Schedule background tasks directly using standard cron expressions. Under the hood, ZilMate handles thread safety, locks, and logs.

```typescript
import { createZilMate } from 'zilmate/server';

const zilmate = createZilMate();

// Register a durable background task
const job = await zilmate.createJob({
  task: 'Analyze HubSpot leads and publish a weekly target report to our corporate wiki.',
  schedule: '0 9 * * 1', // Every Monday at 9:00 AM
});

console.log(`🌌 Cron Job Registered!`);
console.log(`Job ID: ${job.id}`);
console.log(`Cron: ${job.schedule}`);
console.log(`Goal: ${job.task}`);
```

---

## 2. Serverless Webhook Processing (QStash)

In serverless deployment environments (like Vercel or Netlify), long-running background processes do not exist. To execute scheduled tasks, register a webhook handler that is triggered by an external scheduler (like QStash).

Create `app/api/jobs/webhook/route.ts` inside your Next.js project:

```typescript
import { createZilMate } from 'zilmate/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const zilmate = createZilMate();
    
    // Verify payload signature and process the due job
    const executedJob = await zilmate.handleJobWebhook(
      body, 
      process.env.ZILMATE_JOB_WEBHOOK_SECRET
    );

    return Response.json({ 
      success: true, 
      jobId: executedJob.id,
      status: executedJob.status 
    });
  } catch (error: any) {
    return Response.json(
      { success: false, error: error.message }, 
      { status: 500 }
    );
  }
}
```

---

## 3. Local Development Tunneling

During local development, external services (like QStash) cannot route HTTP POST requests to your `localhost` port. ZilMate provides built-in Cloudflare / Quick Tunnel utilities to bridge this gap.

```bash
# Launch a background tunnel routing external QStash triggers directly to your localhost Next.js app
npx zilmate jobs listen --tunnel
```

This launches a temporary tunnel routing external webhook requests seamlessly to `http://localhost:3000/api/jobs/webhook`, enabling local debugging without firewall issues.

---

## 4. Querying and Running Jobs Programmatically

The SDK provides complete CRUD operations to manage, trigger, and review background execution history.

```typescript
import { createZilMate } from 'zilmate/server';

const zilmate = createZilMate();

// 1. Fetch all registered jobs
const jobs = await zilmate.listJobs();

// 2. Run a specific job immediately (bypassing cron wait)
const targetJobId = jobs[0].id;
const runResult = await zilmate.runJob(targetJobId);
console.log(`Job executed with status: ${runResult.status}`);

// 3. Inspect execution log trace
const logs = await zilmate.getJobLogs(targetJobId);
console.log(`--- EXECUTION HISTORY FOR JOB ${targetJobId} ---`);
logs.forEach((log) => {
  console.log(`[${log.timestamp}] [Status: ${log.status}]`);
  console.log(`Output: ${log.message}\n`);
});

// 4. Cancel / Delete a job
await zilmate.cancelJob(targetJobId);
console.log('Job cancelled successfully.');
```

---

## 5. Standard Polling Fallback (Non-Serverless)

If you are not deploying on a serverless provider and prefer running a standard, long-lived background server (Node/Express/Docker), you can periodically trigger the due-jobs evaluator.

```typescript
import { createZilMate } from 'zilmate/server';

const zilmate = createZilMate();

// Setup a 60-second evaluator interval loop
setInterval(async () => {
  try {
    console.log('🔄 Checking for due background cron tasks...');
    const executedCount = await zilmate.runDueJobs();
    if (executedCount > 0) {
      console.log(`✅ Successfully executed ${executedCount} due cron tasks.`);
    }
  } catch (err) {
    console.error('❌ Error executing due jobs:', err);
  }
}, 60000);
```
