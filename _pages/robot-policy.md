---
layout: robot-policy-index
title: Robot policy explorer
heading: Robot policies on the NexArm
permalink: /works/robot-policy/
description: Interactive walkthroughs of the policies we train for the 6-DOF Hiwonder NexArm, each shown step by step next to a 3D model of the arm stacking bowls.
---

Each page follows one control cycle of a policy: what the cameras and joint encoders deliver, how the network turns them into tokens, and how many actions it commits to before looking again. The 3D view is the NexArm from our [MuJoCo model](https://github.com/khanhthanhdev/lerobot-nexarm/tree/main/sim/description/mjcf), placed in the bowl-stacking workcell with the same front, top and wrist cameras the policies are trained on. The project background is in [Building a Robot Learning Pipeline for the 6-DOF NexArm]({{ '/projects/6dof-robot-policy/' | relative_url }}).
