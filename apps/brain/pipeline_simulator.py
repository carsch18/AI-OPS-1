import random
import time
import json
import os

class PipelineSimulator:
    def __init__(self):
        self.state_file = "/tmp/pipeline_state.json"
        self._init_state()

    def _init_state(self):
        if not os.path.exists(self.state_file):
            self.set_state("healthy")

    def set_state(self, mode):
        """
        Modes: 
        - healthy: All stages pass, normal metrics
        - build_fail: Build stage fails
        - latency_high: Pass, but high response time
        - error_spike: Pass, but high 5xx rate
        """
        state = {
            "mode": mode,
            "last_run_timestamp": time.time(),
            "stages": {
                "build": "success",
                "test": "success",
                "deploy": "success"
            },
            "metrics": {
                "latency_ms": round(random.uniform(100, 300), 3),
                "error_rate": round(random.uniform(0, 0.5), 3)
            }
        }

        if mode == "build_fail":
            state["stages"]["build"] = "failed"
            state["stages"]["test"] = "skipped"
            state["stages"]["deploy"] = "skipped"
        elif mode == "latency_high":
            state["metrics"]["latency_ms"] = round(random.uniform(2500, 4000), 3)
        elif mode == "error_spike":
            state["metrics"]["error_rate"] = round(random.uniform(15, 30), 3)

        with open(self.state_file, 'w') as f:
            json.dump(state, f)
        
        return state

    def get_state(self):
        try:
            with open(self.state_file, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return self.set_state("healthy")

if __name__ == "__main__":
    import sys
    sim = PipelineSimulator()
    if len(sys.argv) > 1:
        mode = sys.argv[1]
        print(f"Setting pipeline state to: {mode}")
        print(sim.set_state(mode))
    else:
        print("Current pipeline state:")
        print(sim.get_state())
