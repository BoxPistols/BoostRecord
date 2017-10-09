# Build

## 환경
* npm: 4.x
* node: 7.x

`$ grunt pre-build`를 `npm v5.x`에서 실행할 수 없기 때문에, 반드시 `npm v4.x`를 사용하셔야 합니다.

## 개발

개발에 있어서 Webpack HRM을 사용합니다.
다음과 같은 명령을 프로젝트 디렉토리에서 실행하면, 기본 설정을 사용 할 수 있습니다.

먼저, yarn을 이용해서 필요한 패키지들을 설치합니다.

```
$ yarn
```

그 다음, 아래의 명령으로 빌드를 끝내고 자동적으로 어플리케이션을 실행합니다.

```
$ yarn run dev-start
```

이 명령은 `yarn run webpack` 과 `yarn run hot`을 동시에 실행합니다. 이는 두개의 터미널에서 각각의 명령을 동시에 실행하는 것과 같습니다.

`Webpack`은 코드의 변화를 자동으로 탐지하여 적용시키는 역할을 합니다.

만약, `Failed to load resource: net::ERR_CONNECTION_REFUSED`과 같은 에러가 나타난다면 Boostnote를 리로드해주세요.

![net::ERR_CONNECTION_REFUSED](https://cloud.githubusercontent.com/assets/11307908/24343004/081e66ae-1279-11e7-8d9e-7f478043d835.png)

> ### 주의
> 가끔 직접 리프레쉬를 해주어야 하는 경우가 있습니다.
> 1. 콤포넌트의 컨스트럭터 함수를 수정할 경우
> 2. 새로운 CSS코드를 추가할 경우(1.과 같은 이유: CSS클래스는 콤포넌트마다 다시 만들어 지는데, 이 작업은 컨스트럭터에서 일어납니다.)

## 배포

Boostnote에서는 배포 자동화를 위하여 그런트를 사용합니다.
실제 배포는 `grunt`로 실행할 수 있습니다. 하지만, 여기엔 Codesign과 Authenticode의 과정이 포함되어있기 때문에 사용 하셔선 안됩니다.

그래서, 실행파일만을 만드는 스크립트를 준비해 뒀습니다.

이 빌드는 npm v5.3.0에서는 작동하지 않습니다. 그러므로, 성공적으로 빌드하기 위해서는 v5.2.0을 사용해야 합니다.

```
grunt pre-build
```

실행 파일은 `dist`에서 찾을 수 있습니다. 이 경우, 인증이 되어있지 않기 때문에 업데이터는 사용할 수 없습니다.

필요로 하다면, 이 실행파일에 Codesign나 Authenticode등의 서명을 할 수 있습니다.
