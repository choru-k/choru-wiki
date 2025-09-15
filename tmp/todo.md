todo

## 대규모 kubernetes dns 이슈

core-dns 에 요청이 많이 몰려서 이슈 생김

## kubenetes tology 이슈

zone 에 따라서 적절하게 스케일링이 될줄 알앗는데, 실제로는 한쪽 az 에 pod 이 쏠리는 현상 발생

- topology 의 로직 자체가 현재 남은 node 의 용량을 고려하기 때문에 생각보다 원하는 대로 동작을 안함
그래서 event 을 통해서 켜지고 꺼지는 것도 추적햇음

## aws ec2 ebs 부팅속도 개선

ebs 가 내부적으로 s3 에서 데이터를 읽어오는 과정이 느린 것으로 보임
재밋는건 ami 크기(ami 구울때의 ebs크기)가 8GB, 15GB 이냐에 따라서 속도가 달라짐(실제로 들어있는 데이터의 용량은 같지만)
최대한 작은 ebs 로 ami 을 구웟음
