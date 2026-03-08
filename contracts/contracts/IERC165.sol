// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
pragma solidity ^0.8.19;

/// @title IERC165
/// @notice Minimal ERC165 interface used by ReceiverTemplate.
interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
