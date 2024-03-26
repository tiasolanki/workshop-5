import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value, NodeState } from "../types";
import {delay} from "../utils";

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let currentNodeState: NodeState = {
    killed: false,
    x: initialValue,
    decided: false,
    k: null,
  };

  let proposals: Map<number, Value[]> = new Map();
  let votes: Map<number, Value[]> = new Map();

  // TODO implement this
  // this route allows retrieving the current status of the node
  node.get("/status", (req, res) => {
    // this route should respond with a 500 status and the message faulty if the node is faulty and respond with a 200 status and the message live if the node is not faulty. When a node is faulty, x, decided and k are set to null
    // check if the node is faulty
    if (isFaulty) {
      return res.status(500).send("faulty");
    }
    return res.status(200).send("live");
  });

  // TODO implement this
  // this route allows the node to receive messages from other nodes
  node.post("/message", (req, res) => {
    let messageType: string = req.body.messageType;
    let k: number = req.body.k;
    let x: Value = req.body.x as Value;

    if(!isFaulty && !currentNodeState.killed && !currentNodeState.decided){
      if(messageType === "proposal"){
        let proposalsK = proposals.get(k) ?? [];
        proposalsK.push(x);
        proposals.set(k, proposalsK);

        // if the node has received N - F proposals, it should send a vote message to all other nodes
        if(proposalsK.length >= N - F){
          let occurences: Map<Value, number> = new Map();
          for(let i = 0; i < proposalsK.length; i++){
            let value = proposalsK[i];
            if(occurences.has(value)){
              occurences.set(value, (occurences.get(value) ?? 0) + 1);
            } else {
              occurences.set(value, 1);
            }
          }

          let recurringValue : Value = "?";
          for (const [value, count] of occurences) {
            if (count > (N / 2)) {
              recurringValue = value;
            }
          }

          for(let i = 0; i < N; i++){
            fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messageType: "vote",
                k: k,
                x: recurringValue,
              })
            });
          }
        }
      }
      else {
        let votesK = votes.get(k) ?? [];
        votesK.push(x);
        votes.set(k, votesK);
        // if the node has received N - F votes, it should decide on the value
        if (votesK.length >= N - F) {
          let occurences: Value[] = [];
          for (let i = 0; i < votesK.length; i++) {
            occurences.push(votesK[i]);
          }

          let occurences1 = occurences.filter((value) => value === 1);
          let occurences0 = occurences.filter((value) => value === 0);
          // Case where there is at least F + 1 votes for the same value that is not "?"
          if (occurences1.length >= F + 1) {
            currentNodeState.x = 1;
            currentNodeState.k = k;
            currentNodeState.decided = true;
          } else if (occurences0.length >= F + 1) {
            currentNodeState.x = 0;
            currentNodeState.k = k;
            currentNodeState.decided = true;
          }
          // Case where at least one value other than "?" appears one or more times
          else if (occurences.filter((value) => value !== "?").length > 0) {
            currentNodeState.x = occurences1.length > occurences0.length ? 1 : 0;
            currentNodeState.k = k + 1;
            for (let i = 0; i < N; i++) {
              fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  messageType: "proposal",
                  k: currentNodeState.k,
                  x: currentNodeState.x,
                })
              });
            }
          }
          // Case where all values are "?", then the node increments k and chooses a random value
          else {
            currentNodeState.k = k + 1;
            currentNodeState.x = Math.random() < 0.5 ? 0 as Value : 1 as Value;
            for (let i = 0; i < N; i++) {
              fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  messageType: "proposal",
                  k: currentNodeState.k,
                  x: currentNodeState.x,
                })
              });
            }
          }
        }
      }
    }
    res.status(200).send("message received");
  });

  // TODO implement this
  // this route is used to start the consensus algorithm
  node.get("/start", async (req, res) => {
    if(!isFaulty) {
      while(!nodesAreReady()) {
        await delay(10);
      }

      currentNodeState.k = 1;
      for (let i = 0; i < N; i++) {
        await fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messageType: "proposal",
            k: currentNodeState.k,
            x: currentNodeState.x,
          })
        });
      }
    }
    else {
      currentNodeState.x = null;
      currentNodeState.decided = null;
      currentNodeState.k = null;
    }
    res.status(200).send("started");
  });

  // TODO implement this
  // this route is used to stop the consensus algorithm
  node.get("/stop", async (req, res) => {
    currentNodeState.killed = true;
    res.status(200).send("stopped");
  });

  // TODO implement this
  // get the current state of a node
  node.get("/getState", (req, res) => {
    return res.status(200).send(currentNodeState);
  });

  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}