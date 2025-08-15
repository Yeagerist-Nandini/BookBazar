
## Queue 

```js
const queue = new Queue();
await queue.add('paint', { color: 'blue' }, { delay: 5000 });

```

```js
add(
    name: NameType,
    data: DataType,
    opts?: JobsOptions,
)

await queue.addBulk([{}, {}])

count(): Promise<number>
//Returns the number of jobs waiting to be processed. This includes jobs that are "waiting" or "delayed" or "prioritized" or "waiting-children".
```


### Auto removal of jobs
- when your queue jobs are completed, they are stored in two special sets, the "completed" and the "failed" set.
- we can decide when to delete these records.
- by using **removeOnComplete** and **removeOnFail**

```js
await myQueue.add(
  'test',
  { foo: 'bar' },
  { removeOnComplete: true, removeOnFail: true },  //remove immediatly
); 
```

```js
// Keep a certain number of jobs

await myQueue.add(
  'test',
  { foo: 'bar' },
  { 
    removeOnComplete: 1000, 
    removeOnFail: 5000,
  }
); 
```

```js
// Keep jobs for a certain time

await myQueue.add(
  'test',
  { foo: 'bar' },
  {
    removeOnComplete: {
      age: 60 * 60, // keep up to 1 hour
      count: 1000, // keep up to 1000 jobs
    },
    removeOnFail: {
      age: 24 * 60 * 60, // keep up to 24 hours
    },
  },
);
```

### Removing jobs 

#### Drain 
- Removes all jobs that are waiting or delayed, but not active, waiting-children, completed or failed.
- await queue.drain();

#### Clean 
- Removes jobs in a specific state, but keeps jobs within a certain grace period.
- const deletedJobIds = await queue.clean(
  60000, // 1 minute
  1000, // max number of jobs to clean
  'paused',
);


#### Obliterate
- Completely obliterates a queue and all of its contents.
- await queue.obliterate();


## Workers

- Workers are the actual instances that perform some job based on the jobs that are added in the queue. 
- A worker is a "message" receiver in a message queue. 
- The worker's duty is to complete the job. 
- If it succeeds, the job will be moved to the "completed" status. 
- If the worker throws an exception during its processing, the job will automatically be moved to the "failed" status.


```js
import { Worker, Job } from 'bullmq';

const worker = new Worker(queueName, async (job: Job) => {
  // Optionally report some progress
  await job.updateProgress(42);

  // Optionally sending an object as progress
  await job.updateProgress({ foo: 'bar' });

  // Do something with job
  await persistCart(job.data);

  return 'some value';
});


worker.on('error', err => {
  // log the error
  console.error(err);
});

worker.on('completed', (job, returnvalue) => {
  // Do something with the return value.
});

worker.on('failed', (job, error, prev) => {
  // Do something with the return value.
});
```