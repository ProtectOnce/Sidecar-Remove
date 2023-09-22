const { ECSClient, ListTasksCommand, DescribeTasksCommand, DescribeTaskDefinitionCommand, RegisterTaskDefinitionCommand, UpdateServiceCommand } = require("@aws-sdk/client-ecs");

const CLUSTER_NAME = 'CLUSTER_NAME_HERE';
const REGION = 'REGION_HERE';
const STACK_NAME = 'STACK_NAME_HERE'
const ecs = new ECSClient({ region: REGION }); 


async function listTasks(clusterName) {
  const tasks = [];
  let nextToken;

  do {
    const params = {
      cluster: clusterName,
      nextToken,
    };

    const command = new ListTasksCommand(params);
    const response = await ecs.send(command);

    tasks.push(...response.taskArns);
    nextToken = response.nextToken;
  } while (nextToken);

  return tasks;
}


async function removeSidecar(taskDefinitionArn) {
  const params = {
    taskDefinition: taskDefinitionArn,
  };

  const command = new DescribeTaskDefinitionCommand(params);
  const response = await ecs.send(command);

  const taskDefinition = response.taskDefinition;

  // Check if the task definition has a sidecar
  taskDefinition.containerDefinitions = taskDefinition.containerDefinitions.filter(
    (container) => container.name !== `side-car-${STACK_NAME}`
  );

  // Register the updated task definition
  const registerParams = {
    ...taskDefinition,
  };

  const registerCommand = new RegisterTaskDefinitionCommand(registerParams);
  const registerResponse = await ecs.send(registerCommand);

  return registerResponse.taskDefinition.taskDefinitionArn;
}


async function main() {
  
  const clusterName = CLUSTER_NAME;

  if (!clusterName) {
    console.error('Usage: node script.js <ECS cluster name>');
    return;
  }

  
  const tasks = await listTasks(clusterName);

  
  for (const taskArn of tasks) {
    // Describe the task to get the task definition ARN
    const taskParams = {
      cluster: clusterName,
      tasks: [taskArn],
    };

    const taskCommand = new DescribeTasksCommand(taskParams);
    const taskResponse = await ecs.send(taskCommand);
    const task = taskResponse.tasks[0];
    const taskDefinitionArn = task.taskDefinitionArn;
    console.log("taskARn:",taskDefinitionArn);
    // Remove sidecar from the task definition
    const newTaskDefinitionArn = await removeSidecar(taskDefinitionArn);

    // Update the task with the new task definition
    const updateServiceParams = {
      cluster: clusterName,
      service: task.group.split(":")[1],
      taskDefinition: newTaskDefinitionArn,
    };
    console.log(JSON.stringify(task));
    const updateServiceCommand = new UpdateServiceCommand(updateServiceParams);
    await ecs.send(updateServiceCommand);

    console.log(`Removed sidecar from task: ${taskArn}`);
  }
}

main();
