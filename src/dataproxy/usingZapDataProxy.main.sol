
contract Token {
    function transferFrom(address a, address b, uint256 amt) returns (bool);
    function transfer(address b, uint256 amt) returns (bool);
    function balanceOf(address _owner) constant returns (uint256 balance);
    function approve(address _spender, uint256 _value) public returns (bool);
}

// This must match the signature in dispatch.sol
contract ZapDataProxy {
  function query(address _provider, string _query, address _user, uint256 _tokensPaid) returns (uint256 id);
}

// This must match the signature in lookup.sol
contract ZapDataProxyLookup {
  function getQueryAddress() constant returns (address);
  function getResponseAddress() constant returns (address);
}

// The actual part to be included in a client contract
contract usingZapDataProxy {
  address constant lookupContract =0x9ae267eccf595c1bb3ee644e0e802134f6ef64dd;

  modifier onlyFromZapDataProxy {
    ZapDataProxyLookup lookup = ZapDataProxyLookup(lookupContract);
    if (msg.sender != lookup.getResponseAddress())
      throw;
    _;
  }

  function queryZapDataProxy(address _provider, string query, uint256 _tokensPaid) internal returns (uint256 id) {
    ZapDataProxyLookup lookup = ZapDataProxyLookup(lookupContract);
    ZapDataProxy zapDataProxy = ZapDataProxy(lookup.getQueryAddress());
    return zapDataProxy.query(_provider, query, msg.sender, _tokensPaid);
  }
}
