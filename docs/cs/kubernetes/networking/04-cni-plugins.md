---
tags:
  - Kubernetes
  - CNI
  - Networking
  - Performance
  - Calico
  - Flannel
---

# CNI 플러그인 비교 및 선택 가이드

## 🎯 개요

2021년, Discord가 하루 평균 수억 건의 메시지를 처리하면서 겪은 가장 큰 도전 중 하나는**네트워크 성능**이었습니다. 수천 개의 Pod가 실시간으로 통신하며 음성/비디오 데이터를 주고받는 상황에서, 처음에 사용한 네트워킹 솔루션은 예상보다 높은 지연시간을 보였습니다.

Discord 엔지니어들은 여러 CNI(Container Network Interface) 플러그인을 벤치마킹한 결과,**Cilium의 eBPF 기반 네트워킹**으로 전환하여**네트워크 지연시간을 50% 이상 개선**할 수 있었습니다. 이는 단순히 플러그인을 바꾼 것만으로도 극적인 성능 향상을 달성한 사례입니다.

이처럼 CNI 플러그인의 선택은**클러스터의 성능, 보안, 운영 복잡성에 직접적인 영향**을 미칩니다. 각 플러그인의 아키텍처와 특성을 이해하고 적절한 선택을 하는 것이 중요합니다.

## 📖 CNI 표준과 플러그인 아키텍처

### CNI 인터페이스 스펙

```python
class CNIInterface:
    def __init__(self):
        self.cni_version = "1.0.0"
        self.plugin_types = ["network", "ipam", "meta"]
        
    def cni_command_interface(self):
        """CNI 플러그인 명령어 인터페이스"""
        return {
            "environment_variables": {
                "CNI_COMMAND": "ADD|DEL|CHECK|VERSION",
                "CNI_CONTAINERID": "container_unique_id",
                "CNI_NETNS": "/proc/1234/ns/net",  # 네트워크 네임스페이스
                "CNI_IFNAME": "eth0",  # 컨테이너 내 인터페이스명
                "CNI_ARGS": "additional_arguments",
                "CNI_PATH": "/opt/cni/bin"  # CNI 바이너리 경로
            },
            "stdin_config": {
                "cniVersion": "1.0.0",
                "name": "my-network",
                "type": "bridge",  # 플러그인 타입
                "ipam": {
                    "type": "host-local",
                    "subnet": "10.244.1.0/24"
                }
            }
        }
    
    def plugin_execution_flow(self):
        """CNI 플러그인 실행 흐름"""
        return {
            "ADD_command": [
                "1. kubelet calls CNI plugin with ADD command",
                "2. Plugin creates network interface in container",
                "3. IPAM plugin assigns IP address",
                "4. Plugin configures routing rules",
                "5. Returns network configuration to kubelet"
            ],
            "DEL_command": [
                "1. kubelet calls CNI plugin with DEL command", 
                "2. Plugin removes network interface",
                "3. IPAM plugin releases IP address",
                "4. Plugin cleans up routing rules"
            ]
        }
    
    def plugin_chaining(self):
        """CNI 플러그인 체인"""
        return {
            "concept": "Multiple plugins can be chained together",
            "execution_order": "Sequential execution",
            "example_chain": [
                {"type": "flannel", "role": "Main networking"},
                {"type": "portmap", "role": "Port mapping"},
                {"type": "bandwidth", "role": "Traffic shaping"},
                {"type": "firewall", "role": "Security policies"}
            ]
        }
```

### IPAM (IP Address Management)

```python
class IPAMPlugin:
    def __init__(self, plugin_type="host-local"):
        self.plugin_type = plugin_type
        self.ip_pools = {}
        
    def host_local_ipam(self, subnet):
        """host-local IPAM 구현"""
        return {
            "description": "Store IP allocations on local filesystem",
            "storage_path": "/var/lib/cni/networks/",
            "configuration": {
                "type": "host-local",
                "subnet": subnet,
                "rangeStart": "10.244.1.10",
                "rangeEnd": "10.244.1.254", 
                "gateway": "10.244.1.1",
                "routes": [
                    {"dst": "0.0.0.0/0", "gw": "10.244.1.1"}
                ]
            },
            "advantages": ["Simple", "No external dependencies"],
            "disadvantages": ["No cluster-wide coordination", "Potential IP conflicts"]
        }
    
    def dhcp_ipam(self):
        """DHCP IPAM 구현"""
        return {
            "description": "Lease IPs from external DHCP server",
            "configuration": {
                "type": "dhcp",
                "daemon": "dhcp-daemon"
            },
            "advantages": ["Centralized IP management", "Existing DHCP infrastructure"],
            "disadvantages": ["External dependency", "Network broadcasts"]
        }
    
    def static_ipam(self, ip_address):
        """Static IPAM 구현"""
        return {
            "description": "Static IP assignment for specific pods",
            "configuration": {
                "type": "static",
                "addresses": [{
                    "address": ip_address,
                    "gateway": "10.244.1.1"
                }]
            },
            "use_cases": ["StatefulSets", "Database pods", "Load balancers"]
        }
```

## 🌐 주요 CNI 플러그인 비교

### 1. Flannel - 심플한 Overlay 네트워크

```python
class FlannelCNI:
    def __init__(self):
        self.name = "Flannel"
        self.developed_by = "CoreOS"
        self.architecture_type = "Overlay Network"
        self.backend_modes = ["VXLAN", "host-gw", "UDP"]
        
    def vxlan_implementation(self):
        """VXLAN 백엔드 구현"""
        return {
            "description": "Encapsulates packets in UDP for cross-host communication",
            "default_port": 8472,
            "vni": 1,  # VXLAN Network Identifier
            "configuration": {
                "Network": "10.244.0.0/16",
                "Backend": {
                    "Type": "vxlan",
                    "VNI": 1,
                    "Port": 8472,
                    "GBP": True  # Group Based Policy
                }
            },
            "packet_flow": [
                "1. Pod A sends packet to Pod B (different node)",
                "2. Packet enters flannel.1 VXLAN interface", 
                "3. VXLAN header added with VNI=1",
                "4. UDP encapsulation to destination node",
                "5. Remote node decapsulates and forwards to Pod B"
            ]
        }
    
    def host_gw_mode(self):
        """Host Gateway 모드"""
        return {
            "description": "Direct routing without encapsulation",
            "requirements": ["Layer 2 connectivity between nodes"],
            "performance": "Higher performance than VXLAN",
            "limitations": ["All nodes must be in same subnet"],
            "configuration": {
                "Backend": {
                    "Type": "host-gw"
                }
            },
            "routing_example": {
                "node1": "ip route add 10.244.2.0/24 via 192.168.1.11",
                "node2": "ip route add 10.244.1.0/24 via 192.168.1.10"
            }
        }
    
    def advantages_disadvantages(self):
        """장단점 분석"""
        return {
            "advantages": [
                "Simple setup and configuration",
                "Stable and mature",
                "Multiple backend options",
                "Good documentation",
                "Low resource usage"
            ],
            "disadvantages": [
                "Limited network policies",
                "No built-in security features",
                "Basic load balancing",
                "Performance overhead with VXLAN"
            ],
            "best_for": [
                "Small to medium clusters",
                "Development environments", 
                "Simple networking requirements",
                "Teams new to Kubernetes networking"
            ]
        }
```

### 2. Calico - 정책 기반 네트워킹

```python
class CalicoCNI:
    def __init__(self):
        self.name = "Calico"
        self.developed_by = "Tigera"
        self.architecture_type = "Pure L3 Routing"
        self.data_plane_options = ["Standard Linux", "eBPF", "VPP"]
        
    def bgp_routing_implementation(self):
        """BGP 라우팅 구현"""
        return {
            "description": "Uses BGP to distribute Pod routes",
            "components": {
                "bird": "BGP daemon for route advertisement",
                "felix": "Dataplane programming agent",
                "calico-node": "DaemonSet running on each node",
                "calico-kube-controllers": "Controllers for policy enforcement"
            },
            "bgp_configuration": {
                "as_number": 64512,
                "router_id": "auto",  # Uses node IP
                "peering_mode": "node-to-node mesh",
                "route_reflector": "optional for large clusters"
            },
            "route_advertisement": [
                "Each node advertises its Pod CIDR via BGP",
                "Other nodes install routes to reach remote Pods", 
                "Direct routing without encapsulation",
                "Automatic failover on node failure"
            ]
        }
    
    def network_policy_implementation(self):
        """네트워크 정책 구현"""
        return {
            "policy_types": ["Kubernetes NetworkPolicy", "Calico NetworkPolicy", "GlobalNetworkPolicy"],
            "enforcement_points": ["Ingress", "Egress"],
            "rule_evaluation": {
                "order": "Deny rules → Allow rules → Default deny",
                "granularity": "Pod level, Namespace level, Cluster level",
                "selectors": ["podSelector", "namespaceSelector", "serviceAccountSelector"]
            },
            "iptables_integration": {
                "chains": [
                    "KUBE-FIREWALL (drop packets)",
                    "CALICO-INPUT (host protection)",
                    "CALICO-FORWARD (pod-to-pod traffic)",
                    "CALICO-OUTPUT (pod egress traffic)"
                ],
                "performance": "O(log n) rule lookup with ipset"
            },
            "example_policy": {
                "apiVersion": "projectcalico.org/v3",
                "kind": "NetworkPolicy",
                "metadata": {"name": "deny-all"},
                "spec": {
                    "selector": "all()",
                    "types": ["Ingress", "Egress"],
                    "ingress": [],  # Empty = deny all
                    "egress": []    # Empty = deny all
                }
            }
        }
    
    def ebpf_dataplane(self):
        """eBPF 데이터플레인"""
        return {
            "description": "eBPF-based dataplane for better performance",
            "benefits": [
                "Reduced per-packet processing overhead",
                "Better scalability for network policies",
                "Source IP preservation",
                "Direct Server Return (DSR)"
            ],
            "requirements": [
                "Linux kernel 4.18+ with eBPF support",
                "Compatible with most cloud providers",
                "Not compatible with all Kubernetes features"
            ],
            "performance_gains": {
                "latency_reduction": "10-15%",
                "throughput_increase": "20-30%", 
                "cpu_usage_reduction": "10-20%"
            },
            "configuration": {
                "FELIX_BPFENABLED": "true",
                "FELIX_BPFLOGFILTERS": "all",
                "FELIX_BPFCTLBLOGFILTER": "all"
            }
        }
    
    def ipip_encapsulation(self):
        """IP-in-IP 캡슐화"""
        return {
            "description": "Encapsulation for cross-subnet communication",
            "modes": {
                "Always": "All inter-node traffic encapsulated",
                "CrossSubnet": "Only cross-subnet traffic encapsulated",
                "Never": "No encapsulation (requires routable Pod IPs)"
            },
            "configuration": {
                "CALICO_IPV4POOL_IPIP": "CrossSubnet",
                "CALICO_IPV4POOL_VXLAN": "Never"
            },
            "vs_vxlan": {
                "ipip_overhead": "20 bytes per packet",
                "vxlan_overhead": "50 bytes per packet",
                "recommendation": "Use IPIP for better performance"
            }
        }
```

### 3. Weave Net - 메시 네트워크

```python
class WeaveCNI:
    def __init__(self):
        self.name = "Weave Net"
        self.developed_by = "Weaveworks"
        self.architecture_type = "Mesh Network"
        
    def mesh_networking(self):
        """메시 네트워킹 구현"""
        return {
            "description": "Creates mesh network between all nodes",
            "components": {
                "weave-net": "Main networking daemon",
                "weave-npc": "Network Policy Controller"
            },
            "mesh_characteristics": {
                "topology": "Full mesh between nodes",
                "discovery": "Automatic peer discovery",
                "encryption": "Optional IPSec encryption", 
                "routing": "Gossip protocol for route distribution"
            },
            "packet_routing": [
                "Each node knows about all other nodes",
                "Direct connections where possible",
                "Multi-hop routing through intermediate nodes",
                "Automatic healing on link failures"
            ]
        }
    
    def automatic_ip_allocation(self):
        """자동 IP 할당"""
        return {
            "description": "Automatic IP address allocation without external IPAM",
            "allocation_method": "Consistent hashing",
            "ip_range_per_node": "Deterministic IP range assignment",
            "configuration": {
                "IPALLOC_RANGE": "10.244.0.0/16",
                "WEAVE_MTU": "1376"  # Reduced MTU for encapsulation
            },
            "benefits": [
                "No configuration required",
                "Survives node restarts",
                "Handles IP conflicts automatically"
            ]
        }
    
    def encryption_features(self):
        """암호화 기능"""
        return {
            "encryption_type": "IPSec ESP",
            "key_management": "Shared secret or automatic key rotation",
            "performance_impact": "10-15% throughput reduction",
            "configuration": {
                "WEAVE_PASSWORD": "shared_secret",
                "WEAVE_ENCRYPTION": "true"
            },
            "use_cases": [
                "Multi-tenant environments",
                "Compliance requirements",
                "Untrusted network infrastructure"
            ]
        }
```

### 4. Cilium - eBPF 기반 네트워킹

```python
class CiliumCNI:
    def __init__(self):
        self.name = "Cilium"
        self.developed_by = "Isovalent"
        self.architecture_type = "eBPF-based"
        self.kernel_bypass = True
        
    def ebpf_architecture(self):
        """eBPF 아키텍처"""
        return {
            "description": "Uses eBPF for packet processing in kernel space",
            "components": {
                "cilium-agent": "Main agent on each node",
                "cilium-operator": "Cluster-wide operator",
                "hubble": "Observability platform",
                "cilium-etcd": "Optional etcd cluster for state storage"
            },
            "ebpf_programs": {
                "bpf_sock": "Socket-level load balancing",
                "bpf_lxc": "Container networking",
                "bpf_netdev": "Network device programs",
                "bpf_overlay": "Tunnel encapsulation/decapsulation"
            },
            "performance_benefits": [
                "Packet processing at line rate",
                "No context switches to user space",
                "JIT compilation for optimal performance",
                "CPU-efficient policy enforcement"
            ]
        }
    
    def advanced_load_balancing(self):
        """고급 로드밸런싱"""
        return {
            "maglev_hashing": {
                "description": "Consistent hashing algorithm from Google",
                "benefits": [
                    "Minimal connection disruption during backend changes",
                    "Better connection affinity",
                    "Improved failover behavior"
                ]
            },
            "dsr_support": {
                "description": "Direct Server Return for improved performance",
                "benefits": [
                    "Response traffic bypasses load balancer",
                    "Reduced latency for large responses",
                    "Better bandwidth utilization"
                ]
            },
            "socket_level_lb": {
                "description": "Load balancing at socket level using eBPF",
                "advantages": [
                    "No iptables overhead",
                    "Better connection distribution",
                    "Source IP preservation"
                ]
            }
        }
    
    def service_mesh_integration(self):
        """서비스 메시 통합"""
        return {
            "native_service_mesh": {
                "description": "Built-in service mesh capabilities",
                "features": [
                    "L7 policy enforcement",
                    "HTTP/gRPC load balancing",
                    "Circuit breaking",
                    "Rate limiting",
                    "Distributed tracing"
                ]
            },
            "envoy_integration": {
                "description": "Optional Envoy sidecar for advanced L7 features",
                "sidecar_modes": ["Envoy sidecar", "Envoy embedded", "No sidecar"],
                "l7_policies": [
                    "HTTP method filtering",
                    "Header-based routing",
                    "Kafka topic access control",
                    "gRPC method authorization"
                ]
            },
            "hubble_observability": {
                "description": "Network and service map observability",
                "features": [
                    "Service dependency mapping",
                    "Network flow visualization",
                    "Security event monitoring",
                    "Performance metrics collection"
                ]
            }
        }
    
    def multi_cluster_networking(self):
        """멀티 클러스터 네트워킹"""
        return {
            "cluster_mesh": {
                "description": "Connect multiple Kubernetes clusters",
                "features": [
                    "Cross-cluster service discovery",
                    "Global load balancing",
                    "Multi-cluster network policies",
                    "Transparent encryption between clusters"
                ]
            },
            "configuration": {
                "cluster_name": "cluster-1",
                "cluster_id": 1,
                "mesh_config": {
                    "enable": True,
                    "external_workloads": True
                }
            }
        }
```

### 5. AWS VPC CNI (EKS 전용)

```python
class AWSVPCCNIPlugin:
    def __init__(self):
        self.name = "AWS VPC CNI"
        self.developed_by = "Amazon"
        self.architecture_type = "Cloud Provider Native"
        self.eks_default = True
        
    def eni_allocation_strategy(self):
        """ENI 할당 전략"""
        return {
            "description": "Uses AWS ENI and secondary IPs for Pod networking",
            "components": {
                "aws-node": "DaemonSet running L-IPAM daemon",
                "aws-k8s-cni": "CNI binary for interface creation",
                "ipamd": "IP Address Management Daemon"
            },
            "ip_allocation_flow": [
                "1. ipamd pre-allocates ENIs and secondary IPs",
                "2. Warm pool maintains ready-to-use IPs",
                "3. CNI plugin requests IP from ipamd",
                "4. ipamd assigns IP from warm pool",
                "5. CNI creates veth pair and configures routing"
            ],
            "instance_limits": {
                "m5.large": {"max_enis": 3, "ips_per_eni": 10},
                "m5.xlarge": {"max_enis": 4, "ips_per_eni": 15},
                "m5.2xlarge": {"max_enis": 4, "ips_per_eni": 15},
                "c5n.xlarge": {"max_enis": 4, "ips_per_eni": 50}
            }
        }
    
    def warm_pool_management(self):
        """Warm Pool 관리"""
        return {
            "description": "Pre-allocate IPs for fast Pod startup",
            "configuration": {
                "WARM_ENI_TARGET": "1",  # Keep 1 ENI ready
                "WARM_IP_TARGET": "5",   # Keep 5 IPs ready
                "MAX_ENI": "4",          # Maximum ENIs per node
                "MINIMUM_IP_TARGET": "10"  # Minimum IPs to maintain
            },
            "ip_allocation_timeline": {
                "with_warm_pool": "< 1 second",
                "without_warm_pool": "10-30 seconds (ENI allocation time)",
                "eni_creation_time": "10-15 seconds"
            },
            "cost_considerations": [
                "Each ENI consumes an IP from subnet",
                "Over-provisioning leads to IP exhaustion",
                "Tune warm pool size based on workload patterns"
            ]
        }
    
    def security_groups_per_pod(self):
        """Pod별 보안 그룹"""
        return {
            "description": "Assign specific security groups to individual pods",
            "requirements": [
                "Nitro-based EC2 instances",
                "ENI trunking support",
                "VPC CNI v1.7+"
            ],
            "configuration": {
                "ENABLE_POD_ENI": "true",
                "POD_SECURITY_GROUP_ENFORCING_MODE": "standard"
            },
            "pod_annotation": {
                "vpc.amazonaws.com/pod-eni": '[{"securityGroups":["sg-123456"], "subnet":"subnet-789"}]'
            },
            "use_cases": [
                "Database pods with restrictive access",
                "PCI compliance requirements",
                "Multi-tenant security isolation"
            ]
        }
    
    def custom_networking(self):
        """커스텀 네트워킹"""
        return {
            "description": "Use different subnets for nodes and pods",
            "benefits": [
                "Conserve IP addresses in primary subnet",
                "Separate security zones for pods",
                "Better IP space management"
            ],
            "configuration": {
                "AWS_VPC_K8S_CNI_CUSTOM_NETWORK_CFG": "true",
                "ENI_CONFIG_ANNOTATION_DEF": "k8s.amazonaws.com/eniConfig"
            },
            "eniconfig_example": {
                "apiVersion": "crd.k8s.amazonaws.com/v1alpha1",
                "kind": "ENIConfig", 
                "metadata": {"name": "pod-subnet-config"},
                "spec": {
                    "subnet": "subnet-pod-123",
                    "securityGroups": ["sg-pod-security"]
                }
            }
        }
```

## 📊 성능 및 기능 비교

### 성능 벤치마크 결과

```python
class CNIPerformanceBenchmark:
    def __init__(self):
        self.test_scenarios = ["pod-to-pod", "pod-to-service", "ingress-latency", "throughput"]
        
    def latency_comparison(self):
        """지연시간 비교 (마이크로초 단위)"""
        return {
            "test_setup": {
                "cluster_size": "50 nodes",
                "pods_per_node": "20",
                "instance_type": "m5.xlarge",
                "bandwidth": "10 Gbps"
            },
            "results": {
                "native_host": {"p50": 50, "p95": 80, "p99": 120},
                "cilium_ebpf": {"p50": 65, "p95": 95, "p99": 140},
                "calico_ebpf": {"p50": 70, "p95": 110, "p99": 160},
                "flannel_vxlan": {"p50": 120, "p95": 180, "p99": 250},
                "weave": {"p50": 140, "p95": 200, "p99": 280},
                "calico_iptables": {"p50": 85, "p95": 130, "p99": 180},
                "aws_vpc_cni": {"p50": 60, "p95": 90, "p99": 130}
            },
            "analysis": {
                "best_performance": "Native host networking",
                "best_cni": "AWS VPC CNI (cloud native)",
                "best_opensource": "Cilium eBPF",
                "considerations": "Results vary by workload and cluster size"
            }
        }
    
    def throughput_benchmark(self):
        """처리량 벤치마크 (Gbps)"""
        return {
            "single_stream": {
                "native_host": 9.8,
                "cilium_ebpf": 9.2,
                "aws_vpc_cni": 9.0,
                "calico_ebpf": 8.8,
                "flannel_hostgw": 8.5,
                "calico_iptables": 7.8,
                "flannel_vxlan": 7.2,
                "weave": 6.8
            },
            "multi_stream": {
                "native_host": 9.9,
                "cilium_ebpf": 9.5,
                "aws_vpc_cni": 9.3,
                "calico_ebpf": 9.0,
                "flannel_hostgw": 8.8,
                "calico_iptables": 8.2,
                "flannel_vxlan": 7.8,
                "weave": 7.4
            }
        }
    
    def cpu_utilization(self):
        """CPU 사용률 (네트워크 처리 시)"""
        return {
            "1gbps_load": {
                "native_host": "2%",
                "cilium_ebpf": "4%",
                "aws_vpc_cni": "5%",
                "calico_ebpf": "6%",
                "flannel_hostgw": "8%",
                "calico_iptables": "12%",
                "flannel_vxlan": "15%",
                "weave": "18%"
            },
            "10gbps_load": {
                "native_host": "15%",
                "cilium_ebpf": "22%",
                "aws_vpc_cni": "25%", 
                "calico_ebpf": "28%",
                "flannel_hostgw": "35%",
                "calico_iptables": "45%",
                "flannel_vxlan": "55%",
                "weave": "65%"
            }
        }
    
    def scalability_limits(self):
        """확장성 한계"""
        return {
            "maximum_pods_per_node": {
                "flannel": "110 (kubelet default)",
                "calico": "250+",
                "weave": "110-200",
                "cilium": "500+",
                "aws_vpc_cni": "Instance type dependent (17-737)"
            },
            "policy_rule_performance": {
                "calico": "O(log n) with ipset",
                "cilium": "O(1) with eBPF maps",
                "weave": "O(n) with iptables",
                "flannel": "No policy support"
            },
            "cluster_size_recommendations": {
                "flannel": "< 100 nodes",
                "calico": "< 1000 nodes",
                "weave": "< 100 nodes",
                "cilium": "1000+ nodes",
                "aws_vpc_cni": "Limited by VPC IP space"
            }
        }
```

### 기능 매트릭스

```python
class CNIFeatureMatrix:
    def __init__(self):
        self.features = {}
    
    def networking_features(self):
        """네트워킹 기능 비교"""
        return {
            "encapsulation": {
                "flannel": ["VXLAN", "host-gw", "UDP"],
                "calico": ["IPIP", "VXLAN", "None"],
                "weave": ["VXLAN", "None"],
                "cilium": ["VXLAN", "Geneve", "None"],
                "aws_vpc_cni": ["None (native VPC)"]
            },
            "ipv6_support": {
                "flannel": "Dual-stack support",
                "calico": "Full IPv6 support",
                "weave": "Limited IPv6",
                "cilium": "Full dual-stack",
                "aws_vpc_cni": "IPv6 support (preview)"
            },
            "multicast_support": {
                "flannel": "No",
                "calico": "No",
                "weave": "Yes",
                "cilium": "Yes (eBPF)",
                "aws_vpc_cni": "VPC dependent"
            }
        }
    
    def security_features(self):
        """보안 기능 비교"""
        return {
            "network_policies": {
                "flannel": "No (requires additional plugin)",
                "calico": "Full Kubernetes + Calico policies",
                "weave": "Kubernetes NetworkPolicy only",
                "cilium": "Full policies + L7 filtering",
                "aws_vpc_cni": "Security Groups integration"
            },
            "encryption": {
                "flannel": "No built-in encryption",
                "calico": "WireGuard encryption",
                "weave": "IPSec encryption",
                "cilium": "WireGuard + IPSec",
                "aws_vpc_cni": "No (use VPC encryption)"
            },
            "micro_segmentation": {
                "flannel": "Limited",
                "calico": "Pod-level policies",
                "weave": "Basic policies",
                "cilium": "Identity-based security",
                "aws_vpc_cni": "Security group per pod"
            }
        }
    
    def observability_features(self):
        """관찰성 기능 비교"""
        return {
            "flow_monitoring": {
                "flannel": "Basic logs",
                "calico": "Flow logs + eBPF tracing",
                "weave": "Weave Scope integration",
                "cilium": "Hubble observability platform",
                "aws_vpc_cni": "VPC Flow Logs"
            },
            "metrics_export": {
                "flannel": "Basic Prometheus metrics",
                "calico": "Comprehensive Prometheus metrics",
                "weave": "Weave-specific metrics",
                "cilium": "Hubble + Prometheus metrics",
                "aws_vpc_cni": "CloudWatch integration"
            },
            "distributed_tracing": {
                "flannel": "No",
                "calico": "Limited",
                "weave": "No",
                "cilium": "Full tracing with Hubble",
                "aws_vpc_cni": "AWS X-Ray integration"
            }
        }
```

## 🎯 CNI 플러그인 선택 가이드

### 환경별 추천

```python
class CNISelectionGuide:
    def __init__(self):
        self.selection_criteria = {}
    
    def cloud_provider_recommendations(self):
        """클라우드 프로바이더별 추천"""
        return {
            "aws_eks": {
                "primary_choice": "AWS VPC CNI",
                "reasons": [
                    "Native VPC integration",
                    "Security Groups per Pod",
                    "Best performance on AWS",
                    "AWS support included"
                ],
                "alternatives": {
                    "calico": "For advanced network policies",
                    "cilium": "For service mesh features"
                }
            },
            "google_gke": {
                "primary_choice": "GKE CNI (Calico-based)",
                "reasons": [
                    "Optimized for Google Cloud",
                    "Built-in network policies",
                    "Automatic updates"
                ],
                "alternatives": {
                    "cilium": "For advanced observability"
                }
            },
            "azure_aks": {
                "primary_choice": "Azure CNI",
                "reasons": [
                    "Native Azure networking",
                    "VNET integration",
                    "Azure support"
                ],
                "alternatives": {
                    "calico": "For policy-heavy workloads",
                    "flannel": "For simple setups"
                }
            },
            "on_premises": {
                "primary_choices": ["Calico", "Cilium", "Flannel"],
                "selection_factors": [
                    "Performance requirements",
                    "Security policy complexity",
                    "Team expertise",
                    "Existing infrastructure"
                ]
            }
        }
    
    def workload_based_selection(self):
        """워크로드별 CNI 선택"""
        return {
            "high_performance_computing": {
                "recommended": "Cilium eBPF",
                "reasons": [
                    "Lowest latency overhead",
                    "Kernel bypass networking",
                    "Advanced load balancing"
                ],
                "configuration": {
                    "enable-bpf-masquerade": True,
                    "enable-endpoint-routes": True,
                    "datapath-mode": "netkit"
                }
            },
            "microservices_with_policies": {
                "recommended": "Calico",
                "reasons": [
                    "Rich network policy support",
                    "Good scalability",
                    "Strong security features"
                ],
                "features_to_enable": [
                    "GlobalNetworkPolicy",
                    "eBPF dataplane",
                    "WireGuard encryption"
                ]
            },
            "simple_web_applications": {
                "recommended": "Flannel",
                "reasons": [
                    "Simplicity",
                    "Low operational overhead",
                    "Stable and reliable"
                ],
                "backend_choice": "host-gw for better performance"
            },
            "service_mesh_workloads": {
                "recommended": "Cilium",
                "reasons": [
                    "Native service mesh features",
                    "L7 policy enforcement",
                    "Built-in observability"
                ],
                "service_mesh_mode": "Sidecar-free service mesh"
            }
        }
    
    def migration_strategies(self):
        """CNI 마이그레이션 전략"""
        return {
            "blue_green_cluster_migration": {
                "description": "Create new cluster with target CNI",
                "steps": [
                    "1. Create new cluster with desired CNI",
                    "2. Migrate workloads gradually",
                    "3. Update DNS/load balancers",
                    "4. Decommission old cluster"
                ],
                "downtime": "Minimal",
                "complexity": "Medium"
            },
            "in_place_migration": {
                "description": "Replace CNI in existing cluster",
                "steps": [
                    "1. Drain nodes one by one",
                    "2. Remove old CNI components", 
                    "3. Install new CNI",
                    "4. Restore node to cluster"
                ],
                "downtime": "Rolling downtime",
                "complexity": "High",
                "risks": ["Network disruption", "Pod recreation"]
            },
            "testing_approach": {
                "development_cluster": "Test new CNI thoroughly",
                "canary_nodes": "Deploy to subset of production nodes",
                "monitoring": "Compare performance metrics",
                "rollback_plan": "Automated rollback procedure"
            }
        }
```

### 성능 최적화 가이드

```python
class CNIOptimizationGuide:
    def __init__(self):
        self.optimization_techniques = {}
    
    def flannel_optimizations(self):
        """Flannel 최적화"""
        return {
            "backend_selection": {
                "host-gw": "Best performance, requires L2 connectivity",
                "vxlan": "Good compatibility, moderate overhead",
                "udp": "Fallback option, highest overhead"
            },
            "kernel_optimizations": {
                "net.ipv4.ip_forward": "1",
                "net.bridge.bridge-nf-call-iptables": "1",
                "net.ipv4.conf.all.rp_filter": "1"
            },
            "mtu_optimization": {
                "vxlan_mtu": "1450 (to account for VXLAN overhead)",
                "host_gw_mtu": "1500 (no encapsulation)"
            }
        }
    
    def calico_optimizations(self):
        """Calico 최적화"""
        return {
            "dataplane_selection": {
                "standard": "Stable, iptables-based",
                "ebpf": "Better performance, newer features"
            },
            "bgp_optimizations": {
                "node_to_node_mesh": "Disable for clusters >100 nodes",
                "route_reflectors": "Use for large deployments",
                "cluster_type": "Set appropriate cluster type"
            },
            "ippool_configuration": {
                "block_size": "Optimize based on pod density",
                "nat_outgoing": "Enable for internet access",
                "encapsulation": "CrossSubnet for multi-subnet"
            },
            "felix_tuning": {
                "FELIX_IPTABLESREFRESHINTERVAL": "60s",
                "FELIX_ROUTEREFRESHINTERVAL": "90s",
                "FELIX_IPTABLESLOCKTIMEOUT": "10s"
            }
        }
    
    def cilium_optimizations(self):
        """Cilium 최적화"""
        return {
            "ebpf_optimizations": {
                "enable-endpoint-routes": True,
                "enable-local-redirect-policy": True,
                "enable-bandwidth-manager": True,
                "enable-bpf-masquerade": True
            },
            "kube_proxy_replacement": {
                "enable": True,
                "benefits": [
                    "Better performance",
                    "Source IP preservation",
                    "Advanced load balancing"
                ]
            },
            "hubble_configuration": {
                "metrics": ["dns", "drop", "tcp", "flow", "icmp", "http"],
                "ui": True,
                "relay": True
            }
        }
    
    def monitoring_setup(self):
        """CNI 모니터링 설정"""
        return {
            "key_metrics": [
                "network_latency_seconds",
                "network_throughput_bytes_per_second", 
                "policy_evaluation_time_seconds",
                "endpoint_propagation_delay_seconds"
            ],
            "alerting_rules": [
                "NetworkLatencyHigh",
                "NetworkThroughputLow",
                "PolicyEvaluationSlow",
                "EndpointNotReady"
            ],
            "dashboards": [
                "Network Performance Dashboard",
                "Policy Enforcement Dashboard",
                "CNI Health Dashboard"
            ]
        }
```

## 🛠️ 실습 및 검증

### CNI 플러그인 배포 스크립트

```bash
#!/bin/bash

echo "=== CNI Plugin Deployment and Testing ==="

# 1. Flannel 배포
deploy_flannel() {
    echo "Deploying Flannel CNI..."
    kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
    
    # Flannel 상태 확인
    kubectl wait --for=condition=ready pod -l app=flannel -n kube-system --timeout=120s
}

# 2. Calico 배포  
deploy_calico() {
    echo "Deploying Calico CNI..."
    kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/tigera-operator.yaml
    kubectl create -f - <<EOF
apiVersion: operator.tigera.io/v1
kind: Installation
metadata:
  name: default
spec:
  calicoNetwork:
    ipPools:
    - blockSize: 26
      cidr: 10.244.0.0/16
      encapsulation: VXLANCrossSubnet
      natOutgoing: Enabled
      nodeSelector: all()
EOF
    
    # Calico 상태 확인
    kubectl wait --for=condition=ready pod -l k8s-app=calico-node -n calico-system --timeout=180s
}

# 3. Cilium 배포
deploy_cilium() {
    echo "Deploying Cilium CNI..."
    helm repo add cilium https://helm.cilium.io/
    helm repo update
    helm install cilium cilium/cilium --version 1.14.1 \
        --namespace kube-system \
        --set operator.replicas=1 \
        --set kubeProxyReplacement=strict \
        --set k8sServiceHost=API_SERVER_IP \
        --set k8sServicePort=6443
    
    # Cilium 상태 확인
    kubectl wait --for=condition=ready pod -l k8s-app=cilium -n kube-system --timeout=180s
}

# 4. 네트워크 연결 테스트
test_network_connectivity() {
    echo "Testing network connectivity..."
    
    # 테스트 파드 생성
    kubectl create deployment test-app --image=busybox --replicas=3 -- sleep 3600
    kubectl expose deployment test-app --port=8080 --target-port=8080
    
    # Pod 간 연결 테스트
    POD1=$(kubectl get pods -l app=test-app -o jsonpath='{.items[0].metadata.name}')
    POD2=$(kubectl get pods -l app=test-app -o jsonpath='{.items[1].metadata.name}')
    POD2_IP=$(kubectl get pod $POD2 -o jsonpath='{.status.podIP}')
    
    echo "Testing pod-to-pod connectivity..."
    kubectl exec $POD1 -- ping -c 3 $POD2_IP
    
    # Service 연결 테스트
    echo "Testing service connectivity..."
    kubectl exec $POD1 -- nslookup test-app
    
    # 외부 연결 테스트
    echo "Testing external connectivity..."
    kubectl exec $POD1 -- ping -c 3 8.8.8.8
}

# 5. 성능 벤치마크
run_performance_benchmark() {
    echo "Running network performance benchmark..."
    
    # iperf3 서버 파드 생성
    kubectl create deployment iperf3-server --image=networkstatic/iperf3 -- iperf3 -s
    kubectl expose deployment iperf3-server --port=5201
    
    # iperf3 클라이언트 테스트
    kubectl run iperf3-client --image=networkstatic/iperf3 --rm -it -- \
        iperf3 -c iperf3-server -t 30 -P 4
}

# 메뉴 선택
case "$1" in
    flannel)
        deploy_flannel
        ;;
    calico)
        deploy_calico
        ;;
    cilium)
        deploy_cilium
        ;;
    test)
        test_network_connectivity
        ;;
    benchmark)
        run_performance_benchmark
        ;;
    *)
        echo "Usage: $0 {flannel|calico|cilium|test|benchmark}"
        exit 1
        ;;
esac
```

이처럼 CNI 플러그인의 선택은**클러스터의 요구사항, 성능 목표, 보안 정책, 운영 복잡성**을 종합적으로 고려해야 합니다. 각 플러그인은 고유한 장단점을 가지고 있으며, 환경과 워크로드에 따라 최적의 선택이 달라집니다.

-**단순함이 필요하다면**: Flannel
-**강력한 정책이 필요하다면**: Calico  
-**최고 성능이 필요하다면**: Cilium
-**AWS 환경이라면**: AWS VPC CNI
-**서비스 메시가 필요하다면**: Cilium 또는 Calico + Istio

다음으로는 Kubernetes의**Storage 시스템**에 대해 살펴보겠습니다.
